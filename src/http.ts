import { setTimeout as sleep } from "node:timers/promises";

const CONTACT = process.env.CONTACT_EMAIL;
/** Honest UA: says what this is. Shops that reject it are read with a real browser instead. */
export const USER_AGENT =
  `woplaysi/0.1 (personal PS5 stock alert; low-frequency${CONTACT ? `; contact: ${CONTACT}` : ""})`;

export class HttpError extends Error {
  constructor(public status: number, url: string) {
    super(`HTTP ${status} from ${new URL(url).host}`);
  }
}

/** Plain GET with one polite retry on 429/5xx. A 403 is not retried: that is a "no". */
export async function fetchText(url: string, attempt = 0): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html, application/xml;q=0.9",
      "Accept-Language": "de-DE,de;q=0.9,en;q=0.7",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  if ((res.status === 429 || res.status >= 500) && attempt < 1) {
    await sleep(4_000);
    return fetchText(url, attempt + 1);
  }
  if (!res.ok) throw new HttpError(res.status, url);
  return res.text();
}

/** Shared, lazily-created Playwright browser, only launched if a source needs it. */
let browserPromise: Promise<import("playwright").Browser> | null = null;

export async function renderHtml(url: string, settleMs = 2_500): Promise<string> {
  if (!browserPromise) {
    const { chromium } = await import("playwright");
    browserPromise = chromium.launch({ headless: true });
  }
  const browser = await browserPromise;
  const major = browser.version().split(".")[0];
  const context = await browser.newContext({
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    // What a normal Chrome sends. Not a disguise: for these sources we ARE a browser.
    userAgent: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`,
  });
  const page = await context.newPage();
  try {
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 40_000 });
    const status = res?.status() ?? 0;
    if (status >= 400) throw new HttpError(status, url);
    await page.waitForTimeout(settleMs);
    return await page.content();
  } finally {
    await context.close();
  }
}

/** Try the cheap honest fetch first; fall back to a real browser if the shop refuses it. */
export async function fetchOrRender(url: string): Promise<string> {
  try {
    return await fetchText(url);
  } catch (e) {
    if (e instanceof HttpError && [401, 403, 405, 429, 503].includes(e.status)) return renderHtml(url);
    throw e;
  }
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    await b?.close().catch(() => {});
    browserPromise = null;
  }
}
