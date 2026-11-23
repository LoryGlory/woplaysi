import { setTimeout as sleep } from "node:timers/promises";
import { classify, isConsole, isFair } from "./classify.js";
import type { Offer, Source, SourceResult } from "./types.js";

export interface SourceRun { source: Source; result?: SourceResult; error?: string }

export async function runSource(s: Source): Promise<SourceRun> {
  try {
    const result = await s.run();
    result.offers = result.offers.filter((o) => isConsole(o.title));
    // Degraded-run guard: a suspiciously empty read must not be mistaken for "all sold out".
    if (result.offers.length < s.minOffers) {
      return { source: s, error: `only ${result.offers.length} listings (expected ≥ ${s.minOffers}), read ignored` };
    }
    return { source: s, result };
  } catch (e) {
    return { source: s, error: (e as Error).message.split("\n")[0] };
  }
}

const wouldAlert = (o: Offer) => o.availability === "InStock" && isFair(o.price, classify(o.title).cap);

/**
 * Second look before anyone is notified. Shops occasionally report a console as buyable
 * for a single response (seen at MediaMarkt on the very first deployed run: "available"
 * at 17:13, sold out again at 17:15 and 17:17). For sources that cost one request, read
 * them again after a short pause and keep a new hit only if it is still there.
 *
 * Offers that do not survive are downgraded in place, so the caller sees them as the
 * second read reported them.
 */
export async function confirmNewHits(
  runs: SourceRun[],
  alreadyAlertable: (offerId: string) => boolean,
  delayMs = 15_000,
  rerun: (s: Source) => Promise<SourceRun> = runSource,
): Promise<void> {
  await Promise.all(runs.map(async (r) => {
    if (!r.result || !r.source.confirm) return;
    const fresh = r.result.offers.filter((o) => wouldAlert(o) && !alreadyAlertable(o.id));
    if (!fresh.length) return;

    await sleep(delayMs);
    const again = await rerun(r.source);
    const second = new Map((again.result?.offers ?? []).map((o) => [o.id, o]));
    for (const o of fresh) {
      const o2 = second.get(o.id);
      if (o2 && wouldAlert(o2)) continue;
      // Could not re-read the shop at all: leave the previous status untouched.
      o.availability = again.result ? (o2?.availability ?? "OutOfStock") : "Unknown";
      console.log(`  ↯ ${r.source.name}: "${o.title.slice(0, 60)}" war beim zweiten Blick nicht mehr verfügbar, kein Alarm`);
    }
  }));
}
