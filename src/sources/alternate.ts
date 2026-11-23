import { fetchOrRender } from "../http.js";
import type { Availability, Offer, Source } from "../types.js";
import { htmlToText, parsePriceDe } from "../util.js";

const ORIGIN = "https://www.alternate.de";
const URL_ = `${ORIGIN}/listing.xhtml?q=playstation+5+konsole`;

/** Alternate's search listing is plain server-rendered HTML with a delivery line per card. */
function parse(html: string): Offer[] {
  const cards = html.split(/(?=<a href="[^"]+" class="card[^"]*productBox)/).slice(1);
  return cards.flatMap((card): Offer[] => {
    const href = /href="([^"]+)"/.exec(card)?.[1];
    const name = /class="product-name[^"]*">([\s\S]*?)<\/div>/.exec(card)?.[1];
    if (!href || !name) return [];
    const priceHtml = /class="[^"]*\bprice\b[^"]*"[^>]*>([\s\S]*?)<\/(?:span|div)>/.exec(card)?.[1] ?? "";
    const delivery = htmlToText(/class="[^"]*delivery-info[^"]*"[^>]*>([\s\S]*?)<\/div>/.exec(card)?.[1] ?? "");
    const d = delivery.toLowerCase();

    let availability: Availability = "Unknown";
    if (/nicht gekauft|nicht verfügbar|nicht lieferbar|ausverkauft|liefertermin unbekannt/.test(d)) availability = "OutOfStock";
    else if (/sofort verfügbar|auf lager|lieferbar|versandfertig|verfügbar/.test(d)) availability = "InStock";

    return [{
      id: `alternate:${href.split("/").pop()}`,
      retailer: "Alternate",
      title: htmlToText(name),
      url: ORIGIN + href,
      price: parsePriceDe(htmlToText(priceHtml)),
      availability,
      note: availability === "InStock" ? delivery : undefined,
    }];
  });
}

export const alternate: Source = {
  id: "alternate",
  name: "Alternate",
  url: URL_,
  minOffers: 1,
  confirm: true,
  run: async () => ({ offers: parse(await fetchOrRender(URL_)) }),
};
