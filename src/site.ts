import fs from "node:fs";
import { MODEL_LABEL, RRP, TOLERANCE } from "./classify.js";
import { sources } from "./sources/index.js";
import type { State } from "./state.js";
import { fmtEur } from "./util.js";

const DIR = "site";
const xml = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

/**
 * Writes the data the public status page reads (site/status.json) and an Atom feed of
 * past alerts (site/feed.xml). The feed lets people follow along in Slack, Teams or any
 * RSS reader without installing anything.
 */
export function writeSite(state: State): void {
  fs.mkdirSync(DIR, { recursive: true });
  const siteUrl = (process.env.SITE_URL || "").replace(/\/$/, "");

  const status = {
    generatedAt: state.lastRun,
    tolerancePct: Math.round(TOLERANCE * 100),
    models: Object.fromEntries(Object.entries(MODEL_LABEL).map(([k, label]) => [k, { label, rrp: RRP[k as keyof typeof RRP] }])),
    subscribe: {
      ntfy: process.env.NTFY_TOPIC ? `${(process.env.NTFY_SERVER || "https://ntfy.sh").replace(/\/$/, "")}/${process.env.NTFY_TOPIC}` : null,
      ntfyTopic: process.env.NTFY_TOPIC || null,
      telegram: process.env.TELEGRAM_JOIN_URL || null,
      email: process.env.EMAIL_SUBSCRIBE_URL || null,
      feed: siteUrl ? `${siteUrl}/feed.xml` : "feed.xml",
    },
    sources: sources.map((s) => ({ id: s.id, name: s.name, url: s.url, ...state.sources[s.id] })),
    offers: Object.entries(state.offers)
      // Only what the source's latest good read still lists.
      .filter(([, o]) => o.lastSeen === state.sources[o.source]?.lastOk)
      .map(([id, o]) => ({ id, ...o, stale: !state.sources[o.source]?.ok })),
    deals: state.deals.slice(0, 8),
    events: state.events.slice(0, 20),
  };
  fs.writeFileSync(`${DIR}/status.json`, JSON.stringify(status));

  const entries = state.events.slice(0, 30).map((e) => `
  <entry>
    <id>urn:woplaysi:${xml(e.at)}:${xml(e.url)}</id>
    <title>${xml(`${e.kind === "stock" ? "🟢 Verfügbar" : "🔥 Deal"}: ${e.title} (${e.retailer}, ${fmtEur(e.price)})`)}</title>
    <link href="${xml(e.url)}"/>
    <updated>${xml(e.at)}</updated>
    <summary>${xml(`${e.retailer} · ${fmtEur(e.price)}`)}</summary>
  </entry>`).join("");
  fs.writeFileSync(`${DIR}/feed.xml`, `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>urn:woplaysi:feed</id>
  <title>Wo PlaySi: PS5-Verfügbarkeit in Deutschland</title>
  <updated>${xml(state.events[0]?.at ?? state.lastRun ?? new Date().toISOString())}</updated>
  <author><name>woplaysi</name></author>${siteUrl ? `\n  <link href="${xml(siteUrl)}/"/>\n  <link rel="self" href="${xml(siteUrl)}/feed.xml"/>` : ""}${entries}
</feed>
`);
}
