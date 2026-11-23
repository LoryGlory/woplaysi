import type { Model } from "./types.js";

/** Sony's list prices in Germany (checked against PlayStation Direct, Nov 2026). */
export const RRP: Record<Model, number> = { pro: 899.99, disc: 649.99, digital: 599.99 };
export const MODEL_LABEL: Record<Model, string> = {
  pro: "PS5 Pro",
  disc: "PS5 (mit Laufwerk)",
  digital: "PS5 Digital Edition",
};

/** How far above list price still counts as a fair offer (0.15 = 15 %). */
export const TOLERANCE = Number(process.env.PRICE_TOLERANCE ?? 0.15);
/** Bundles legitimately cost more (second controller, game). */
const BUNDLE_EXTRA_EUR = 150;

export interface Classification {
  model: Model;
  bundle: boolean;
  refurbished: boolean;
  /** Highest price that still triggers an alert. */
  cap: number;
}

export function classify(title: string): Classification {
  const t = title.toLowerCase();
  const model: Model = /\bpro\b/.test(t) ? "pro" : /digital/.test(t) ? "digital" : "disc";
  const bundle = /bundle|paket|\+|inkl\.?|2x |zwei dualsense|2 controller|zusätzlich/.test(t);
  const refurbished = /generalüberholt|refurbished|gebraucht|b-ware|zweite chance/.test(t);
  const cap = Math.round((RRP[model] * (1 + TOLERANCE) + (bundle ? BUNDLE_EXTRA_EUR : 0)) * 100) / 100;
  return { model, bundle, refurbished, cap };
}

/** A price we can't read is treated as fair: better one alert too many than a missed restock. */
export const isFair = (price: number | null, cap: number): boolean => price == null || price <= cap;

const PS5 = /(playstation|ps)\s*[®™]?\s*5|playstation\s*[®™]?\s*pro/i;
const CONSOLE_WORD = /konsole|console|bundle|paket|digital|slim|\bpro\b|chassis|laufwerk\b.*\+|\b(825\s?gb|1\s?tb|2\s?tb)\b/i;
const ACCESSORY = /standfuß|ständer|halterung|headset|ohrhörer|ladestation|cover|faceplate|hülle|tasche|kabel|portal|vr2|lenkrad|festplatte|\bssd\b(?!-)|fernbedienung|kamera/i;
const ACCESSORY_ONLY = /controller|dualsense|disc-laufwerk|laufwerk für/i;

/** True for PS5 consoles and console bundles, false for games and accessories. */
export function isConsole(title: string): boolean {
  if (!PS5.test(title)) return false;
  const isKonsole = /konsole|console|spielekonsole|spielkonsole/i.test(title);
  if (/für (die )?(playstation|ps)\s*[®™]?\s*5|kompatibel mit/i.test(title)) return false;
  if (ACCESSORY.test(title) && !isKonsole && !/\+/.test(title)) return false;
  if (ACCESSORY_ONLY.test(title) && !isKonsole && !/bundle|paket|\+|slim|digital|\bpro\b/i.test(title)) return false;
  return CONSOLE_WORD.test(title);
}
