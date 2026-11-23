import type { AlertEvent } from "./state.js";
import { fmtEur } from "./util.js";

const SITE_URL = process.env.SITE_URL || "";

function headline(events: AlertEvent[]): string {
  if (events[0]?.kind === "test") return "Testalarm: Benachrichtigungen funktionieren";
  const stock = events.filter((e) => e.kind === "stock");
  if (stock.length === 1) return `PS5 verfügbar bei ${stock[0].retailer}`;
  if (stock.length > 1) return `PS5 verfügbar: ${stock.length} Angebote (${[...new Set(stock.map((e) => e.retailer))].join(", ")})`;
  return events.length === 1 ? `PS5-Deal: ${events[0].retailer}` : `${events.length} neue PS5-Deals`;
}

const icon = (e: AlertEvent): string => (e.kind === "stock" ? "🟢" : e.kind === "deal" ? "🔥" : "🧪");
const meta = (e: AlertEvent): string =>
  e.kind === "test" ? e.retailer : `${e.retailer} · ${fmtEur(e.price)}${e.note ? `\n${e.note}` : ""}`;
const line = (e: AlertEvent): string => `${icon(e)} ${e.title}\n${meta(e)}\n${e.url}`;

const esc = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/** ntfy.sh: colleagues subscribe to the topic in the ntfy app or browser. No account needed. */
async function sendNtfy(events: AlertEvent[]): Promise<boolean> {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return false;
  // JSON publish (not headers): header values can't carry umlauts or emoji.
  const res = await fetch(process.env.NTFY_SERVER || "https://ntfy.sh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      topic,
      title: headline(events),
      message: events.map((e) => `${e.title}\n${meta(e)}`).join("\n\n"),
      click: events[0].url,
      actions: events.slice(0, 3).map((e) => ({ action: "view", label: `${e.retailer} öffnen`.slice(0, 40), url: e.url })),
      priority: events[0].kind === "test" ? 3 : 4,
      tags: ["video_game"],
    }),
  });
  if (!res.ok) console.warn(`  ntfy failed: HTTP ${res.status}`);
  return res.ok;
}

/** Telegram: TELEGRAM_CHAT_ID may be a private chat, a group, or a channel like "@name". */
async function sendTelegram(events: AlertEvent[]): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;
  const text = `<b>${esc(headline(events))}</b>\n\n` +
    events.map((e) => `${icon(e)} <b>${esc(e.title)}</b>\n${esc(meta(e))}\n${e.url}`).join("\n\n");
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4000), parse_mode: "HTML", disable_web_page_preview: true }),
  });
  if (!res.ok) console.warn(`  telegram failed: HTTP ${res.status}`);
  return res.ok;
}

/** E-mail over any SMTP account. Recipients go in BCC so they never see each other. */
async function sendEmail(events: AlertEvent[]): Promise<boolean> {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS, EMAIL_TO } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !EMAIL_TO) return false;
  const { default: nodemailer } = await import("nodemailer");
  const port = Number(process.env.SMTP_PORT || 465);
  const transport = nodemailer.createTransport({
    host: SMTP_HOST, port, secure: port === 465, auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  const from = process.env.EMAIL_FROM || SMTP_USER;
  const footer = SITE_URL ? `\n\nAlle Angebote und Abmelden: ${SITE_URL}` : "";
  try {
    await transport.sendMail({
      from: `"Wo PlaySi" <${from}>`,
      to: from,
      bcc: EMAIL_TO.split(/[,;\s]+/).filter(Boolean),
      subject: `${icon(events[0])} ${headline(events)}`,
      text: events.map(line).join("\n\n") + footer,
    });
    return true;
  } catch (e) {
    console.warn(`  email failed: ${(e as Error).message}`);
    return false;
  }
}

/** Send to every configured channel. Returns the names of the channels that accepted it. */
export async function notify(events: AlertEvent[]): Promise<string[]> {
  const results = await Promise.all([
    sendNtfy(events).catch(() => false),
    sendTelegram(events).catch(() => false),
    sendEmail(events).catch(() => false),
  ]);
  return ["ntfy", "telegram", "email"].filter((_, i) => results[i]);
}

/**
 * `npm run test-alert`: one clearly labelled test message through every configured
 * channel, so subscribers can check their setup without waiting for a real restock.
 */
export async function notifyTest(): Promise<string[]> {
  return notify([{
    at: new Date().toISOString(),
    kind: "test",
    title: "Das ist nur ein Test. So kommt eine echte PS5-Meldung bei dir an.",
    retailer: "Wo PlaySi",
    price: null,
    url: SITE_URL || "https://ntfy.sh/",
  }]);
}
