/* THE WHOLE ATLAS, FOR THINGS THAT ARE NOT THE MAP.
   index.json was split in two so the map can draw before the quiet dots
   arrive: index.json carries the 20,841 places that have something to
   show, index-quiet.json the 4,932 that are real ground nobody has walked
   yet. That split is a loading strategy for ONE consumer — the browser.

   Every static page is built on a machine with the whole file already on
   disk and nothing to wait for. Left to import index.json alone they would
   have quietly dropped those 4,932 places: no /place/<id>/ page for them,
   missing from their country's list, missing from the coverage totals —
   the atlas telling visitors those places do not exist because of a
   decision about network latency. So the pages import this instead, and
   get the index whole. */
import idx from "../../public/index.json";
import quiet from "../../public/index-quiet.json";

export const atlas = { ...idx, places: idx.places.concat(quiet.places) };
export default atlas;
