import "dotenv/config";
import { classify, isFair } from "./classify.js";
import { closeBrowser } from "./http.js";
import { notify, notifyTest } from "./notify.js";
import { writeSite } from "./site.js";
import { sources } from "./sources/index.js";
import { loadState, saveState, type AlertEvent } from "./state.js";
import { confirmNewHits, runSource } from "./run.js";
import { fmtEur } from "./util.js";

/** Don't re-alert the same listing more often than this if it flickers in and out of stock. */
const REALERT_COOLDOWN_MS = 60 * 60 * 1000;
/** Listings a shop no longer shows are forgotten after this long. */
const PRUNE_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  if (process.argv.includes("--test-alert")) {
    const sent = await notifyTest();
    console.log(sent.length ? `Test alert sent via: ${sent.join(", ")}` : "No notification channel configured (set NTFY_TOPIC, TELEGRAM_* or SMTP_* in .env)");
    process.exit(sent.length ? 0 : 1);
  }
  const state = loadState();
  const now = new Date().toISOString();
  const nowMs = Date.parse(now);
  console.log(`[${now}] checking ${sources.length} sources${DRY_RUN ? " (dry run: no notifications)" : ""}`);

  const runs = await Promise.all(sources.map(runSource));
  await confirmNewHits(runs, (id) => Boolean(state.offers[id]?.alertable));
  await closeBrowser();

  const alerts: AlertEvent[] = [];

  for (const { source, result, error } of runs) {
    const prevSrc = state.sources[source.id];
    if (!result) {
      state.sources[source.id] = {
        ok: false, lastRun: now, lastOk: prevSrc?.lastOk, error,
        failingSince: prevSrc?.ok === false ? prevSrc.failingSince : now, count: prevSrc?.count ?? 0,
      };
      console.log(`  ✗ ${source.name}: ${error}`);
      continue;
    }
    state.sources[source.id] = { ok: true, lastRun: now, lastOk: now, count: result.offers.length + (result.deals?.length ?? 0) };
    console.log(`  ✓ ${source.name}: ${result.offers.length} listings${result.deals ? `, ${result.deals.length} console deals` : ""}`);

    for (const o of result.offers) {
      const prev = state.offers[o.id];
      // An unreadable listing keeps its last known status rather than flipping it.
      const availability = o.availability === "Unknown" ? prev?.availability ?? "Unknown" : o.availability;
      const cls = classify(o.title);
      const alertable = availability === "InStock" && isFair(o.price, cls.cap);
      const flipped = !prev || prev.alertable !== alertable;

      const tag = availability === "InStock" ? (alertable ? "🟢 verfügbar" : "🟠 überteuert") : availability === "OutOfStock" ? "🔴 ausverkauft" : "❓ unklar";
      console.log(`      ${tag}  ${fmtEur(o.price).padStart(12)}  ${o.title.slice(0, 80)}${o.note ? `  (${o.note})` : ""}`);

      let lastAlert = prev?.lastAlert;
      const cooledDown = !lastAlert || nowMs - Date.parse(lastAlert) > REALERT_COOLDOWN_MS;
      if (alertable && !prev?.alertable && cooledDown) {
        alerts.push({ at: now, kind: "stock", title: o.title, retailer: o.retailer, price: o.price, url: o.url, note: o.note });
        lastAlert = now;
      }
      state.offers[o.id] = {
        source: source.id, retailer: o.retailer, title: o.title, url: o.url, price: o.price,
        availability, note: o.note, ...cls, alertable,
        since: flipped ? now : prev.since, lastSeen: now, lastAlert,
      };
    }

    if (result.deals) {
      const firstRead = state.seenDeals === null;
      const seen = new Set(state.seenDeals ?? []);
      for (const d of result.deals) {
        if (seen.has(d.id)) continue;
        seen.add(d.id);
        // First read only seeds: months-old posts are not news.
        if (!firstRead) alerts.push({ at: now, kind: "deal", title: d.title, retailer: `${d.merchant} (über mydealz)`, price: d.price, url: d.url });
      }
      state.seenDeals = [...seen].slice(-500);
      state.deals = result.deals.slice(0, 15);
    }
  }

  for (const [id, o] of Object.entries(state.offers)) {
    if (nowMs - Date.parse(o.lastSeen) > PRUNE_AFTER_MS) delete state.offers[id];
  }

  if (alerts.length) {
    console.log(`\n  ${alerts.length} alert(s):`);
    for (const a of alerts) console.log(`    ${a.kind === "stock" ? "🟢" : "🔥"} ${a.retailer}: ${a.title} (${fmtEur(a.price)})`);
    if (!DRY_RUN) {
      const sent = await notify(alerts);
      console.log(sent.length ? `  sent via: ${sent.join(", ")}` : "  ⚠ no notification channel configured (set NTFY_TOPIC, TELEGRAM_* or SMTP_*)");
    }
    state.events = [...alerts, ...state.events].slice(0, 50);
  } else {
    console.log("\n  no new availability");
  }

  state.lastRun = now;
  // A dry run is a look, not a run: it must not swallow alerts the next real run should send.
  if (!DRY_RUN) saveState(state);
  writeSite(state);

  // Fail the run only when nothing could be read at all: that deserves GitHub's failure mail.
  if (runs.every((r) => !r.result)) {
    console.error("all sources failed");
    process.exit(1);
  }
}

main().catch(async (e) => {
  console.error(e);
  await closeBrowser();
  process.exit(1);
});
