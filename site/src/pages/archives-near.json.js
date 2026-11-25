/* One compact file of every located archive and its stated contact, for the story plan. See src/lib/archives-near.js. */
import providers from "../../../data/providers.json";
import contacts from "../../../data/provider-contacts.json";
import { buildArchivesNear } from "../lib/archives-near.js";

export function GET() {
  return new Response(JSON.stringify(buildArchivesNear(providers, contacts)), { headers: { "Content-Type": "application/json" } });
}
