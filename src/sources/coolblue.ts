import { renderHtml } from "../http.js";
import type { Offer, Source } from "../types.js";
import { jsonLdBlocks, schemaAvailability } from "../util.js";

// The category page, not the search: Coolblue's robots.txt disallows /suchen.
const URL_ = "https://www.coolblue.de/konsolen/playstation-5";

/**
 * Coolblue rejects non-browser clients outright, so this one is read with a real
 * (headless) browser. The page embeds a schema.org ItemList with price + availability.
 */
function parse(html: string): Offer[] {
  const list = jsonLdBlocks(html).find((b) => b?.["@type"] === "ItemList" && Array.isArray(b.itemListElement));
  if (!list) throw new Error("no product list in page");
  return list.itemListElement
    .map((e: any) => e.item ?? e)
    .filter((p: any) => p?.name && p?.url)
    .map((p: any): Offer => ({
      id: `coolblue:${p.productID ?? p.sku}`,
      retailer: "Coolblue",
      title: String(p.name),
      url: String(p.url),
      price: p.offers?.price != null ? Number(p.offers.price) : null,
      availability: schemaAvailability(p.offers?.availability),
    }));
}

export const coolblue: Source = {
  id: "coolblue",
  name: "Coolblue",
  url: URL_,
  minOffers: 1,
  confirm: true,
  run: async () => ({ offers: parse(await renderHtml(URL_)) }),
};
