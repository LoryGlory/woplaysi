import fs from "node:fs";
import type { Availability, Deal, Model } from "./types.js";

/** Plain JSON file. Survives between GitHub Actions runs via actions/cache. */
const FILE = process.env.STATE_FILE || "state.json";

export interface OfferState {
  source: string;
  retailer: string;
  title: string;
  url: string;
  price: number | null;
  availability: Availability;
  note?: string;
  model: Model;
  bundle: boolean;
  refurbished: boolean;
  cap: number;
  /** In stock AND at a fair price: the only condition that alerts. */
  alertable: boolean;
  /** When `alertable` last flipped. */
  since: string;
  lastSeen: string;
  lastAlert?: string;
}

export interface SourceState {
  ok: boolean;
  lastRun: string;
  lastOk?: string;
  failingSince?: string;
  error?: string;
  count: number;
}

export interface AlertEvent {
  at: string;
  kind: "stock" | "deal" | "test";
  title: string;
  retailer: string;
  price: number | null;
  url: string;
  note?: string;
}

export interface State {
  version: 1;
  lastRun?: string;
  offers: Record<string, OfferState>;
  sources: Record<string, SourceState>;
  /** null until the first successful mydealz read: that first read only seeds, it never alerts. */
  seenDeals: string[] | null;
  deals: Deal[];
  events: AlertEvent[];
}

export function loadState(): State {
  try {
    const s = JSON.parse(fs.readFileSync(FILE, "utf8")) as State;
    if (s.version === 1) return s;
  } catch {
    /* first run or unreadable file: start clean */
  }
  return { version: 1, offers: {}, sources: {}, seenDeals: null, deals: [], events: [] };
}

export function saveState(state: State): void {
  fs.writeFileSync(FILE, JSON.stringify(state, null, 1));
}
