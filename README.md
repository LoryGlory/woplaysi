# woplaysi

Polite PS5 stock monitor for Germany, covering all console versions (Pro, disc, Digital
Edition, bundles, Sony-refurbished). Sibling of `klima-monitor` and `car-monitor`.

Every few minutes it reads eight sources, works out which consoles are **in stock at a fair
price**, and when that changes it notifies everyone who subscribed. It also publishes a
small status page you can send to colleagues: it shows what is available right now and how
to subscribe.

## What it watches

| Source | How it is read | What it tells us |
| --- | --- | --- |
| MediaMarkt, Saturn | plain request, data embedded in the category page | stock + price per console, marketplace sellers flagged |
| PlayStation Direct | overview page, then one product page per console (5 s apart, as Sony's robots.txt asks) | whether Sony offers a buy option, for the 20 newest console listings |
| Alternate | plain request, search listing | stock + price |
| Coolblue | headless browser (rejects everything else) | stock + price |
| SpieleGrotte | plain request, its PS5 hardware section | small independent shop; a console appearing there means it is orderable |
| Geizhals | plain request, five fixed product pages | cheapest offer across dozens of shops incl. Amazon, Otto, eBay dealers |
| mydealz | RSS feed of the PS5 group | community "Verfügbarkeitsdeals", often minutes after a restock |

Left out on purpose (see the comment in [src/sources/index.ts](src/sources/index.ts)):
idealo, Otto, Amazon, Kaufland, Müller, Euronics and others either block automated access
or forbid it. Geizhals and mydealz cover most of them indirectly.

## When does it alert?

An offer alerts when it flips to **in stock and at most 15 % above Sony's list price**
(bundles get €150 extra headroom). Sony's list prices live in
[src/classify.ts](src/classify.ts); the tolerance is `PRICE_TOLERANCE`.

During a shortage most "available" offers are scalper-priced marketplace listings. Those
show up on the status page as *überteuert* and never alert.

Other rules:

- The same listing re-alerts at most once an hour if it flickers.
- mydealz posts alert once each; the very first run only records what is already there.
- A source that suddenly returns nothing is treated as broken, not as "sold out": its
  last known state is kept and the status page marks it *gestört*.

### Caveat: PlayStation Direct

Sony's stock flag is unreliable: on 2026-11-23 it said "in stock" for two bundles that a
logged-in customer could not buy ("Nicht zum Kauf erhältlich"). What did match reality is
the button Sony renders, which is also recorded in the page data. The bot therefore
counts a Sony console as available only when the flag says in stock **and** the page
offers a buy option.

That rule has only ever been seen in its sold-out state. The first time Sony really
restocks, check that the alert fires and the page is buyable; if not, adjust
`readProduct()` in [src/sources/psdirect.ts](src/sources/psdirect.ts).

## Run it locally

```bash
npm install
npx playwright install chromium   # once, for Coolblue
cp .env.example .env              # optional: add notification channels

npm run dry       # check everything, print the result, send nothing, keep no state
npm run once      # real run: sends alerts, updates state.json
npm run test-alert  # one clearly labelled test message to every configured channel
npm run preview   # status page at http://localhost:4173
```

A run takes about two minutes, nearly all of it the polite pauses for PlayStation Direct.

## Testing the alerts

Subscribe first (ntfy app or `https://ntfy.sh/<topic>` in a browser), then run
`npm run test-alert`. It sends one message marked "Testalarm" through every configured
channel and prints which channels accepted it. It checks no shops and changes no state.

## How colleagues subscribe

All of these appear as buttons on the status page once configured:

- **ntfy push** (`NTFY_TOPIC`): install the free ntfy app, subscribe to the topic. No
  account. Works out of the box.
- **Telegram** (`TELEGRAM_*`): point the bot at a channel and share the invite link.
- **E-mail** (`SMTP_*`, `EMAIL_TO`): any SMTP account; recipients are BCC'd. For
  self-service sign-up use a Google Group as the single recipient and put its join link
  in `EMAIL_SUBSCRIBE_URL`.
- **Feed** (`feed.xml`): always on; works with Slack's and Teams' RSS apps.

## Deploy (GitHub Actions + Pages)

[.github/workflows/check.yml](.github/workflows/check.yml) runs every 5 minutes, keeps
`state.json` between runs via `actions/cache`, and publishes `site/` to GitHub Pages
straight from the run (nothing is committed back).

```bash
gh repo create woplaysi --public --source=. --push
gh api -X POST repos/:owner/woplaysi/pages -f build_type=workflow
gh variable set NTFY_TOPIC --body "<topic from .env>"
gh workflow run woplaysi                       # first real check
gh workflow run woplaysi -f test_alert=true    # only send a test alert
```

Public repo because Pages and unlimited Actions minutes need it on the free plan.
Secrets (Telegram, SMTP) go in with `gh secret set`. GitHub pauses scheduled workflows
after 60 days without repo activity. It e-mails first; one click re-enables.

Not yet tested from GitHub's servers: shops that answer a home connection may refuse a
data-centre address. Sources fall back to the headless browser on a 403, and the status
page shows per-source health.

## House rules

Public pages only, personal use, low frequency. robots.txt is respected (that is why
Coolblue is read via its category page and Geizhals via fixed product pages). The
User-Agent says what this is. A 403 means stop, not try harder. The bot never logs in,
never adds to cart, never buys. This is an alert, not a scalper tool.
