export type Availability = "InStock" | "OutOfStock" | "Unknown";
export type Model = "pro" | "disc" | "digital";

/** One console listing at one retailer, as read in this run. */
export interface Offer {
  /** Stable key for state storage: `${sourceId}:${productId}`. */
  id: string;
  retailer: string;
  title: string;
  /** Human-facing product URL (used in alerts and on the status page). */
  url: string;
  price: number | null;
  availability: Availability;
  /** Short human note, e.g. "Marketplace-Händler" or "günstigster Anbieter: X". */
  note?: string;
}

/** A community deal post (mydealz). Alerts fire once per new post, not per state change. */
export interface Deal {
  id: string;
  title: string;
  url: string;
  merchant: string;
  price: number | null;
  published: string; // ISO
}

export interface SourceResult {
  offers: Offer[];
  deals?: Deal[];
}

export interface Source {
  id: string;
  name: string;
  /** Page a human would open to see the same data. */
  url: string;
  /**
   * Fewer offers than this means the read is unreliable (blocked, layout changed):
   * the run is discarded for this source and the previous state is kept.
   */
  minOffers: number;
  run: () => Promise<SourceResult>;
}
