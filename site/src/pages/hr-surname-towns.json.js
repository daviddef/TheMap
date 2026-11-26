/* Croatia's ten most common surnames by town and municipality (2021 census), for the story page. See lib/hr-surname-towns.js. */
import { face } from "../lib/hr-surname-towns.js";

export function GET() {
  return new Response(JSON.stringify(face()), { headers: { "Content-Type": "application/json; charset=utf-8" } });
}
