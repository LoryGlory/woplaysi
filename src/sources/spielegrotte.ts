import { fetchOrRender } from "../http.js";
import type { Availability, Offer, Source } from "../types.js";
import { htmlToText, parsePriceDe } from "../util.js";

const ORIGIN = "https://spielegrotte.de/";
// PS5 → "Hardware / Zubehör". One small page; consoles show up here when the shop has any.
const URL_ = `${ORIGIN}index.php?kat=100100&subkat=260`;

/**
 * SpieleGrotte, a small independent games shop. It only lists what it can deliver
 * ("Bereits erhältlich") or take pre-orders for, so most of the time this section holds
 * accessories only and the source reports zero consoles. That is the normal state, not a
 * fault: the health check is "did we read any items at all", not "did we find a console".
 */
export function parse(html: string): Offer[] {
  const blocks = html.split('<div class="alleartikel">').slice(1);
  if (!blocks.length) throw new Error("no items found in page (layout changed?)");
  return blocks.flatMap((b): Offer[] => {
    const link = /<a href="(index\.php\?kat=\d+&(?:amp;)?anr=(\d+))">([\s\S]*?)<\/a>/.exec(b);
    if (!link) return [];
    const status = htmlToText(/<span class="klein_neu_grau">([\s\S]*?)<\/span>/.exec(b)?.[1] ?? "");
    const priceHtml = /text-align:right;"><a [^>]*>([\s\S]*?)<\/a>/.exec(b)?.[1] ?? "";

    let availability: Availability = "Unknown";
    let note: string | undefined;
    if (/bereits erhältlich|sofort lieferbar|auf lager/i.test(status)) availability = "InStock";
    else if (/vorbestell|erscheint|release/i.test(status)) { availability = "InStock"; note = `Vorbestellung: ${status}`; }
    else if (/ausverkauft|nicht lieferbar|vergriffen/i.test(status)) availability = "OutOfStock";

    return [{
      id: `spielegrotte:${link[2]}`,
      retailer: "SpieleGrotte",
      title: htmlToText(link[3]),
      url: ORIGIN + link[1].replace("&amp;", "&"),
      price: parsePriceDe(htmlToText(priceHtml)),
      availability,
      note,
    }];
  });
}

export const spielegrotte: Source = {
  id: "spielegrotte",
  name: "SpieleGrotte",
  url: URL_,
  minOffers: 0,
  run: async () => ({ offers: parse(await fetchOrRender(URL_)) }),
};
