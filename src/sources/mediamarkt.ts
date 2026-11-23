import { fetchOrRender } from "../http.js";
import type { Availability, Offer, Source } from "../types.js";

/**
 * MediaMarkt and Saturn run the same shop platform. The category page ships its data
 * as `window.__PRELOADED_STATE__` (an Apollo cache), which carries clean availability
 * flags per product, far more reliable than reading button texts.
 */
function parse(html: string, sourceId: string, retailer: string, origin: string): Offer[] {
  const start = /window\.__PRELOADED_STATE__\s*=\s*/.exec(html);
  if (!start) throw new Error("no preloaded state in page");
  const from = start.index + start[0].length;
  const raw = html.slice(from, html.indexOf("</script>", from)).trim().replace(/;$/, "");
  // The blob is a JS object literal, not strict JSON: it contains bare `undefined`.
  const state = JSON.parse(raw.replace(/:\s*undefined/g, ":null"));
  const apollo: Record<string, any> = state.apolloState ?? {};

  // Feature records are keyed inconsistently, but each carries id "<SalesLine>:de:<productId>".
  const features = new Map<string, Record<string, any>>();
  for (const v of Object.values(apollo)) {
    if (!v || typeof v.id !== "string" || !String(v.__typename).startsWith("Cofr")) continue;
    const pid = v.id.split(":").pop()!;
    if (!features.has(pid)) features.set(pid, {});
    features.get(pid)![v.__typename] = v;
  }

  const offers: Offer[] = [];
  for (const [key, p] of Object.entries(apollo)) {
    if (!key.startsWith("GraphqlProduct:")) continue;
    const f = features.get(p.id) ?? {};
    const online = f.CofrOnlineStatusFeature;
    const delivery = f.CofrDeliveryFeature?.delivery;
    const priceF = f.CofrPriceFeature;

    let availability: Availability = "Unknown";
    const deliverable = ["AVAILABLE", "PARTIALLY_AVAILABLE"].includes(delivery?.deliveryStatus);
    if (online?.isAvailableAndBuyable === true || deliverable) availability = "InStock";
    else if (online?.isAvailableAndBuyable === false) availability = "OutOfStock";

    // Raw flags in the run log: this shop answers differently depending on where the
    // request comes from, and these lines are the only way to see that after the fact.
    console.log(`      [${retailer} raw ${p.id}] online=${online?.onlineStatus} buyable=${online?.isAvailableAndBuyable} forDelivery=${online?.isAvailableForDelivery} delivery=${delivery?.deliveryStatus}/${delivery?.displayStatus} zipCheck=${delivery?.isZipCodeCheckNeeded} pickup=${f.CofrPickupFeature?.displayStatus}`);

    const marketplace = Boolean(priceF?.isProductOfTypeMarketplace || p.assortmentType === "MARKETPLACE");
    offers.push({
      id: `${sourceId}:${p.id}`,
      retailer,
      title: p.title,
      url: origin + p.url,
      price: priceF?.price?.amount ?? null,
      availability,
      note: marketplace ? "Marketplace-Händler" : undefined,
    });
  }
  return offers;
}

function make(id: string, name: string, origin: string, path: string): Source {
  const url = origin + path;
  return {
    id,
    name,
    url,
    minOffers: 1,
    confirm: true,
    run: async () => ({ offers: parse(await fetchOrRender(url), id, name, origin) }),
  };
}

export const mediamarkt = make(
  "mediamarkt", "MediaMarkt", "https://www.mediamarkt.de", "/de/category/playstation-5-konsolen-7857.html",
);
export const saturn = make(
  "saturn", "Saturn", "https://www.saturn.de", "/de/category/ps5-konsolen-7854.html",
);
