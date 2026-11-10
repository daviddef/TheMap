#!/usr/bin/env python3
"""Send a built dist/ (or a part of it) to the R2 bucket that the pages Worker serves, uploading only what changed.

    python3 scripts/r2_sync.py --dist site/dist --part slice-3 --only place surname name       # CI, S3 API
    python3 scripts/r2_sync.py --dist site/dist --part static --skip place surname name
    python3 scripts/r2_sync.py ... --backend wrangler                                         # from a laptop, no token
    python3 scripts/r2_sync.py ... --backend dir --target /tmp/fake-bucket                     # tests

A PART is one slice of the site. Each part keeps its own manifest (`_manifest/<part>.json`: key -> sha256) in the bucket, so the
parallel slice jobs never see or delete each other's files: a part uploads the keys whose hash differs from its manifest, deletes the
keys its manifest holds that the build no longer produced, and then writes the new manifest. Nothing is deleted that this part did
not put there. Credentials for the S3 backend are read from the environment (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
R2_SECRET_ACCESS_KEY) and never printed.
"""
import argparse, concurrent.futures as cf, hashlib, json, mimetypes, os, shutil, subprocess, sys, tempfile

TEXT = {".html": "text/html; charset=utf-8", ".json": "application/json; charset=utf-8", ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8", ".xml": "application/xml; charset=utf-8", ".txt": "text/plain; charset=utf-8",
        ".svg": "image/svg+xml", ".csv": "text/csv; charset=utf-8", ".webmanifest": "application/manifest+json"}


def ctype(key):
    ext = os.path.splitext(key)[1].lower()
    return TEXT.get(ext) or mimetypes.guess_type(key)[0] or "application/octet-stream"


def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def local_files(dist, only, skip):
    """key -> absolute path, for the files this part is responsible for."""
    out = {}
    for root, _, fs in os.walk(dist):
        for f in fs:
            p = os.path.join(root, f)
            key = os.path.relpath(p, dist).replace(os.sep, "/")
            top = key.split("/", 1)[0]
            if only and top not in only:
                continue
            if skip and top in skip:
                continue
            out[key] = p
    return out


class DirBackend:
    def __init__(self, target): self.t = target
    def _p(self, k): return os.path.join(self.t, k)
    def get(self, k):
        try: return open(self._p(k), "rb").read()
        except FileNotFoundError: return None
    def put(self, k, path, ct):
        os.makedirs(os.path.dirname(self._p(k)), exist_ok=True); shutil.copyfile(path, self._p(k))
    def put_bytes(self, k, data, ct):
        os.makedirs(os.path.dirname(self._p(k)), exist_ok=True); open(self._p(k), "wb").write(data)
    def delete(self, k):
        try: os.remove(self._p(k))
        except FileNotFoundError: pass


class S3Backend:
    def __init__(self, bucket):
        import boto3  # only the CI job installs it
        acct = os.environ["R2_ACCOUNT_ID"]
        self.b = bucket
        self.c = boto3.client("s3", endpoint_url=f"https://{acct}.r2.cloudflarestorage.com", region_name="auto",
                              aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"], aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"])
    def get(self, k):
        try: return self.c.get_object(Bucket=self.b, Key=k)["Body"].read()
        except self.c.exceptions.NoSuchKey: return None
    def put(self, k, path, ct):
        # upload_file spins up its own transfer threads per object, which costs more than the upload for a 2 KB file (the first full
        # run managed about 10 files a second); small files go as one plain PUT, large ones keep the multipart path
        if os.path.getsize(path) < 8 << 20:
            with open(path, "rb") as f:
                self.c.put_object(Bucket=self.b, Key=k, Body=f.read(), ContentType=ct)
        else:
            self.c.upload_file(path, self.b, k, ExtraArgs={"ContentType": ct})
    def put_bytes(self, k, data, ct): self.c.put_object(Bucket=self.b, Key=k, Body=data, ContentType=ct)
    def delete(self, k): self.c.delete_object(Bucket=self.b, Key=k)


class WranglerBackend:
    """Slow (one process per object) but needs no token: it uses the login `wrangler login` left on this machine."""
    def __init__(self, bucket, cwd):
        self.b, self.cwd = bucket, cwd
    def _run(self, *a):
        return subprocess.run(["npx", "wrangler", "r2", "object", *a, "--remote"], capture_output=True, cwd=self.cwd)
    def get(self, k):
        with tempfile.NamedTemporaryFile() as t:
            r = self._run("get", f"{self.b}/{k}", "--file", t.name)
            return open(t.name, "rb").read() if r.returncode == 0 else None
    def put(self, k, path, ct):
        r = self._run("put", f"{self.b}/{k}", "--file", path, "--content-type", ct)
        if r.returncode: raise RuntimeError(f"put {k}: {r.stderr.decode()[-200:]}")
    def put_bytes(self, k, data, ct):
        with tempfile.NamedTemporaryFile() as t:
            t.write(data); t.flush(); self.put(k, t.name, ct)
    def delete(self, k): self._run("delete", f"{self.b}/{k}")


def sync(backend, dist, part, only, skip, jobs=16, dry=False, log=print):
    files = local_files(dist, only, skip)
    if not files:
        raise SystemExit(f"nothing to send: no files under {dist} for part {part!r}")
    with cf.ThreadPoolExecutor(jobs) as ex:
        now = dict(zip(files, ex.map(sha, files.values())))
    mkey = f"_manifest/{part}.json"
    raw = backend.get(mkey)
    before = json.loads(raw) if raw else {}
    add = [k for k, h in now.items() if before.get(k) != h]
    gone = [k for k in before if k not in now]
    log(f"{part}: {len(now)} files, {len(add)} to upload, {len(gone)} to delete, {len(now) - len(add)} unchanged")
    if dry:
        return {"upload": add, "delete": gone}
    with cf.ThreadPoolExecutor(jobs) as ex:
        list(ex.map(lambda k: backend.put(k, files[k], ctype(k)), add))
    for k in gone:
        backend.delete(k)
    backend.put_bytes(mkey, json.dumps(now, sort_keys=True).encode(), "application/json")
    return {"upload": add, "delete": gone}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dist", required=True); ap.add_argument("--part", required=True)
    ap.add_argument("--only", nargs="*", default=[]); ap.add_argument("--skip", nargs="*", default=[])
    ap.add_argument("--backend", choices=["s3", "wrangler", "dir"], default="s3")
    ap.add_argument("--bucket", default="record-atlas-site"); ap.add_argument("--target")
    ap.add_argument("--jobs", type=int, default=48); ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    if a.backend == "dir":
        be = DirBackend(a.target)
    elif a.backend == "wrangler":
        be = WranglerBackend(a.bucket, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "workers", "pages"))
    else:
        missing = [v for v in ("R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY") if not os.environ.get(v)]
        if missing:
            sys.exit("::error::missing " + ", ".join(missing) + ": create an R2 API token and add it as repository secrets, see docs/split-build.md")
        be = S3Backend(a.bucket)
    sync(be, a.dist, a.part, a.only, a.skip, a.jobs, a.dry_run)


if __name__ == "__main__":
    main()
