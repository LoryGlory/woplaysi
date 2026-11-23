import type { Source } from "../types.js";
import { mediamarkt, saturn } from "./mediamarkt.js";
import { psdirect } from "./psdirect.js";
import { alternate } from "./alternate.js";
import { coolblue } from "./coolblue.js";
import { geizhals } from "./geizhals.js";
import { mydealz } from "./mydealz.js";
import { spielegrotte } from "./spielegrotte.js";

/**
 * Checked and deliberately left out (don't retry without a new idea):
 *  - idealo:  blocks automated access entirely, even in a real browser (403, incl. robots.txt).
 *  - Otto:    HTTP 400 for automated browsers. Kaufland / Müller / Euronics / Smyths /
 *             Cyberport / Conrad / Proshop / notebooksbilliger: bot walls (403 / "are you human").
 *  - Amazon:  search results are dominated by marketplace sellers at 2× list price and
 *             automated access is against their terms. Covered indirectly: Amazon offers
 *             show up on Geizhals, and real Amazon restocks get posted on mydealz.
 *  - Expert / Medimax: no orderable consoles in their online listings.
 */
export const sources: Source[] = [mediamarkt, saturn, psdirect, alternate, coolblue, spielegrotte, geizhals, mydealz];
