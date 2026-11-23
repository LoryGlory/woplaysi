import { setTimeout as sleep } from "node:timers/promises";
import { fetchOrRender } from "../http.js";
import type { Offer, Source } from "../types.js";
import { jsonLdBlocks, schemaAvailability } from "../util.js";

const LIST_URL = "https://www.playstation.com/de-de/consoles/ps5/shop-all/";
/** playstation.com/robots.txt asks for `Crawl-delay: 5`. */
const CRAWL_DELAY_MS = 5_000;

interface Listed { id: string; name: string; price: number | null }

/**
 * Sony's own shop. The overview page lists the consoles (newest 20) but not their stock,
 * so: one overview request, then one request per console product page, spaced by the
 * crawl delay Sony asks for. See readProduct() for how a product page is judged.
 */
function parseList(html: string): Listed[] {
  // Product data sits in the page's embedded (string-escaped) Next.js payload.
  const text = html.replaceAll('\\"', '"');
  const re = /"__typename":"Product","id":"(PSD001-[A-Z0-9_]+-[A-Z0-9]+)","name":"([^"]+)"[^{}]*"price":\{[^{}]*?"discountedValue":(\d+)/g;
  const seen = new Map<string, Listed>();
  for (const [, id, name, cents] of text.matchAll(re)) {
    if (!seen.has(id)) {
      seen.set(id, { id, name: name.replace(/\\+[tn]/g, " ").replace(/\s+/g, " ").trim(), price: Number(cents) / 100 });
    }
  }
  return [...seen.values()];
}

/**
 * Decide availability from one product page.
 *
 * Sony's stock flag (schema.org markup, `stockLevelStatus`) cannot be trusted: it said
 * "in stock" for consoles that a logged-in customer could not buy (checked by hand,
 * 2026-11-23). What matched reality is the button Sony renders, recorded in the page data
 * as `activeCtaId`. "UNAVAILABLE" is the "Nicht zum Kauf erhältlich" state. So a console
 * counts as available only when the flag says in stock AND the button is something else.
 */
export function readProduct(html: string, productId: string): Pick<Offer, "availability" | "price" | "note"> {
  const node = jsonLdBlocks(html).find((b) => b?.["@type"] === "Product" && b.productID === productId);
  const o = Array.isArray(node?.offers) ? node.offers[0] : node?.offers;
  const price = o?.price != null && Number.isFinite(Number(o.price)) ? Number(o.price) : null;
  const flag = schemaAvailability(o?.availability);

  const text = html.replaceAll('\\"', '"');
  const cta = new RegExp(`"activeCtaId":"([A-Z_]+):[A-Z_]+:${productId}-`).exec(text)?.[1];
  if (!cta) return { availability: flag === "OutOfStock" ? "OutOfStock" : "Unknown", price, note: flag === "InStock" ? "Kaufstatus nicht lesbar" : undefined };
  if (cta === "UNAVAILABLE" || flag !== "InStock") return { availability: "OutOfStock", price };
  return { availability: "InStock", price, note: "Sony zeigt eine Kaufoption. Zum Bestellen brauchst du ein PlayStation-Konto." };
}

async function checkProduct(p: Listed): Promise<Offer> {
  // Same link the overview page itself uses; it redirects to the product page.
  const url = `https://www.playstation.com/api/pdp-redirect/?locale=de-de&id=${p.id}`;
  const offer: Offer = { id: `psdirect:${p.id}`, retailer: "PlayStation Direct", title: p.name, url, price: p.price, availability: "Unknown" };
  try {
    const read = readProduct(await fetchOrRender(url), p.id);
    offer.availability = read.availability;
    offer.note = read.note;
    if (read.price != null) offer.price = read.price;
  } catch (e) {
    offer.note = (e as Error).message;
  }
  return offer;
}

export const psdirect: Source = {
  id: "psdirect",
  name: "PlayStation Direct",
  url: LIST_URL,
  minOffers: 5,
  run: async () => {
    const listed = parseList(await fetchOrRender(LIST_URL));
    const offers: Offer[] = [];
    for (const p of listed) {
      await sleep(CRAWL_DELAY_MS);
      offers.push(await checkProduct(p));
    }
    // If most product pages failed, the whole read is unreliable.
    const known = offers.filter((o) => o.availability !== "Unknown").length;
    if (listed.length && known < listed.length / 2) throw new Error(`only ${known}/${listed.length} product pages readable`);
    return { offers };
  },
};
