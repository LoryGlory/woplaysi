/** "1.715,14" | "899,-" | "729,00" | "599,99€" → number. null if no price found. */
export function parsePriceDe(text: string): number | null {
  const m = /(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{2}|-))?/.exec(text.replace(/\s/g, ""));
  if (!m) return null;
  const cents = m[2] && m[2] !== "-" ? m[2] : "00";
  const n = Number(`${m[1].replaceAll(".", "")}.${cents}`);
  return Number.isFinite(n) ? n : null;
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", reg: "®", trade: "™", euro: "€",
  auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß",
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name] ?? ENTITIES[name.toLowerCase()] ?? m);
}

/** Strip tags, decode entities, collapse whitespace. */
export function htmlToText(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/** All parsed <script type="application/ld+json"> blocks in a page (malformed ones skipped). */
export function jsonLdBlocks(html: string): any[] {
  const out: any[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const [, raw] of html.matchAll(re)) {
    try {
      out.push(JSON.parse(raw.trim()));
    } catch {
      /* keep scanning */
    }
  }
  return out;
}

/** Map schema.org availability URLs to our enum. */
export function schemaAvailability(value: unknown): "InStock" | "OutOfStock" | "Unknown" {
  if (typeof value !== "string") return "Unknown";
  const v = value.toLowerCase();
  if (/instock|limitedavailability|onlineonly|preorder|backorder/.test(v)) return "InStock";
  if (/outofstock|soldout|discontinued/.test(v)) return "OutOfStock";
  return "Unknown";
}

export const fmtEur = (n: number | null | undefined): string =>
  n == null ? "Preis unbekannt" : `${n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
