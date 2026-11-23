import { fetchOrRender } from "../http.js";
import { isConsole } from "../classify.js";
import type { Deal, Source } from "../types.js";
import { decodeEntities, parsePriceDe } from "../util.js";

const FEED = "https://www.mydealz.de/rss/gruppe/playstation-5";

/**
 * mydealz community feed for the PS5 group. People post "Verfügbarkeitsdeals" there
 * within minutes of a restock, including shops we cannot read ourselves (Amazon, Otto).
 * Filtered down to actual console deals you can order online.
 */
function parse(xml: string): Deal[] {
  const cdata = (s: string | undefined) => decodeEntities((s ?? "").replace(/<!\[CDATA\[|\]\]>/g, "").trim());
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].flatMap(([, item]): Deal[] => {
    const title = cdata(/<title>([\s\S]*?)<\/title>/.exec(item)?.[1]);
    const url = cdata(/<link>([\s\S]*?)<\/link>/.exec(item)?.[1]);
    const pub = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(item)?.[1];
    if (!title || !url) return [];
    const price = parsePriceDe(/pepper:merchant[^>]*price="([^"]*)"/.exec(item)?.[1] ?? "");
    return [{
      id: url.split("-").pop() || url,
      title,
      url,
      merchant: decodeEntities(/pepper:merchant[^>]*name="([^"]*)"/.exec(item)?.[1] ?? "") || "unbekannt",
      price,
      published: pub ? new Date(pub).toISOString() : new Date().toISOString(),
    }];
  });
}

/** Console deals only: no games, no local-store-only posts, no phone-contract bundles. */
export function isConsoleDeal(d: Deal): boolean {
  if (!isConsole(d.title)) return false;
  if (/lokal|\[psn\]|ps store|gigakombi|vodafone|telekom|o2 |allnet|tarif|vertrag|refurbished|gebraucht/i.test(d.title)) return false;
  return d.price == null || d.price >= 300;
}

export const mydealz: Source = {
  id: "mydealz",
  name: "mydealz (PS5-Deals)",
  url: "https://www.mydealz.de/gruppe/playstation-5",
  minOffers: 0,
  run: async () => {
    const all = parse(await fetchOrRender(FEED));
    if (!all.length) throw new Error("feed has no items");
    return { offers: [], deals: all.filter(isConsoleDeal) };
  },
};
