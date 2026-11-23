import { setTimeout as sleep } from "node:timers/promises";
import { fetchOrRender } from "../http.js";
import type { Offer, Source } from "../types.js";
import { parsePriceDe } from "../util.js";

/**
 * Geizhals is a price-comparison site: one product page lists every shop that currently
 * offers the console (Amazon, Otto, Conrad, eBay dealers, …), cheapest first. We report
 * the cheapest offer; the price cap in classify.ts decides whether it is worth an alert:
 * during a shortage most of what is listed here is scalper-priced.
 *
 * Fixed product pages on purpose: Geizhals' robots.txt disallows its search and category
 * listings, product pages are allowed.
 */
const PRODUCTS = [
  { slug: "sony-playstation-5-slim-1tb-weiss-1000040586-a3039116", title: "PlayStation 5 Slim 1 TB (mit Laufwerk)" },
  { slug: "sony-playstation-5-slim-digital-edition-825gb-weiss-1000049749-a3607040", title: "PlayStation 5 Slim Digital Edition 825 GB" },
  { slug: "sony-playstation-5-pro-2tb-weiss-a3298140", title: "PlayStation 5 Pro 2 TB" },
  { slug: "sony-playstation-5-slim-1tb-inkl-2-controller-weiss-1000042051-a3125977", title: "PlayStation 5 Slim 1 TB + 2 Controller Bundle" },
  { slug: "sony-playstation-5-slim-digital-edition-825gb-inkl-2-controller-weiss-1000042065-a3670215", title: "PlayStation 5 Slim Digital Edition 825 GB + 2 Controller Bundle" },
];

interface Listing { price: number; merchant: string; via: string }

function parseOffers(html: string): Listing[] {
  const blocks = html.split(/(?=<div\s+class="offer offer--)/).slice(1);
  return blocks.flatMap((b): Listing[] => {
    const price = parsePriceDe(/class="gh_price">([^<]+)</.exec(b)?.[1] ?? "");
    const merchant = /data-merchant-name="([^"]+)"/.exec(b)?.[1];
    if (price == null || !merchant) return [];
    const via = /class="offer__merchant-link">\s*\(via ([^)]+)\)/.exec(b)?.[1] ?? "";
    return [{ price, merchant, via }];
  });
}

async function check(p: (typeof PRODUCTS)[number]): Promise<Offer> {
  const url = `https://geizhals.de/${p.slug}.html`;
  const offer: Offer = {
    id: `geizhals:${p.slug.split("-").pop()}`,
    retailer: "Geizhals (Preisvergleich)",
    title: p.title,
    url,
    price: null,
    availability: "Unknown",
  };
  try {
    const html = await fetchOrRender(url);
    const listings = parseOffers(html).sort((a, b) => a.price - b.price);
    if (!listings.length) {
      // A product page that loads but lists nobody means: no shop has it.
      if (/Preisvergleich|geizhals/i.test(html)) offer.availability = "OutOfStock";
      return offer;
    }
    const best = listings[0];
    offer.availability = "InStock";
    offer.price = best.price;
    offer.note = `Günstigster von ${listings.length} Anbietern: ${best.merchant}${best.via ? ` (über ${best.via})` : ""}`;
  } catch (e) {
    offer.note = (e as Error).message;
  }
  return offer;
}

export const geizhals: Source = {
  id: "geizhals",
  name: "Geizhals (Preisvergleich)",
  url: "https://geizhals.de/",
  minOffers: 3,
  run: async () => {
    const offers: Offer[] = [];
    for (const p of PRODUCTS) {
      offers.push(await check(p));
      await sleep(2_000);
    }
    return { offers: offers.filter((o) => o.availability !== "Unknown") };
  },
};
