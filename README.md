# Vasupradah Client Console

Back-office console for Vasupradah Investment Advisory Services P Ltd (SEBI
Registered Investment Adviser) — client records, portfolio/holdings tracking,
advisory orders, and client communication (WhatsApp / email), built around a
**suitability-first workflow**: every recommendation is tied to a client's
risk category, and a suitability statement is required before advice can be
sent.

## Layout

```
console/
  VasupradahClientConsole.html   The whole client app: a single, portable
                                  HTML file (React UI + bundled libraries).
                                  Open it directly in a browser, or host it
                                  as a static page. Nothing server-side runs
                                  from this file.

google-apps-script/
  Code.gs                        The backend, as a plain .gs file for
                                  reading/reviewing/diffing in an editor.
                                  Byte-identical to the console's embedded
                                  APPS_SCRIPT copy, and deliberately pure
                                  ASCII — the Apps Script editor rejects
                                  pasted source containing characters like
                                  em dashes or "·" with "Invalid or
                                  unexpected token", so non-ASCII lives in
                                  string literals as \uXXXX escapes only.
  appsscript.json                Apps Script manifest (best-effort defaults —
                                  check it against your actual deployment's
                                  Project Settings before relying on it).

order-link-proxy/
  app.py                         Small Flask server that forwards Advice
                                  orders' execute-link requests to the
                                  order-link Gateway server-to-server (the
                                  Gateway itself can't be called straight
                                  from a browser — see below).
```

## Architecture

- **`console/VasupradahClientConsole.html`** is a self-contained, offline-first
  React app. State lives in the browser's `localStorage` (clients, prices,
  trades, rates). It's meant to be portable — one file you can open locally,
  email, or host anywhere as static HTML.
- **`google-apps-script/Code.gs`** is a Google Apps Script Web App, deployed
  separately, bound to the "ADVISORY CLIENT DATA" Google Sheet. It exposes a
  `doGet`/`doPost` JSON API the console calls (over `fetch`) to back up and
  restore data, pull live prices/holdings, sync trades via the "GridKey" feed,
  and send email.
- **These two pieces are independent deployments.** The console carries its
  own embedded copy of the backend source (`APPS_SCRIPT` constant, shown
  under Settings → Google Sheet backup → "Copy backend code") so a user can
  copy-paste it straight into the Apps Script editor without leaving the app.
  `Code.gs` here is that same source, extracted so it can be read and
  version-controlled normally. The two are currently byte-identical; **if you
  change the backend logic, update both copies** — there's no build step
  wiring them together yet. Note the embedded copy lives inside a JS template
  literal, so a backslash there must be written `\\` (a single `\uFEFF`
  silently becomes an invisible BOM character in the pasted code).

## Deploying the backend

1. Open the "ADVISORY CLIENT DATA" Google Sheet → Extensions → Apps Script.
2. Replace the script contents with `google-apps-script/Code.gs` (or use the
   in-app "Copy backend code" button in Settings).
3. Run `setup` once from the function dropdown and approve the permissions —
   it sends you a confirmation email and reports your Gmail send quota.
4. Deploy → Manage deployments → New version, execute as yourself, access
   "Anyone". Paste the resulting Web App URL into the console's Settings tab.

## Suitability / risk-category workflow

Risk categories: `Low Risk`, `Medium to Low Risk`, `Medium to High Risk`,
`High Risk`, `SIP`. Every client record carries one, and:

- Per-category **concentration limits** cap how much of a portfolio a single
  position can occupy (Settings → concentration limits).
- **Advice/order lines require a suitability statement** — the UI blocks
  sending advice without one, and can pre-fill a standard suitability note
  referencing the client's risk category.
- Stock baskets carry a rationale and suitability note per risk category.
- The onboarding checklist tracks "Suitability Assessment recorded" and
  "Risk profiling / suitability noted" as required items.

Client-facing messages (trade alerts, advice, portfolio statements) are
stamped with the firm's SEBI RIA registration number.

## Two client cohorts: email approval vs execute link

Clients act on advice in one of two ways, set per client in **Settings → How
each client acts on advice** (bulk-assignable; unset defaults to email
approval). The choice is stored in the Google Sheet's **`OrderMethod`** tab
(`Client code | Name | Method | Updated at`), so it survives a device reset
and reaches other staff devices on the next team sync — each click saves
straight away, and "Save all to sheet" / "Load from sheet" cover a bulk
upload or a restore. Rows are upserted by client code, so moving a client
from one model to the other later just rewrites their row:

- **Email approval** — the advice mail ends with **Approve the order** /
  **Reject the order** buttons. Approve opens a reply addressed to the
  dealing desk — `pratheep.kambalath@iiflcapital.com` in To, the advisory
  team in Cc (first address in the setting is the To, the rest are Cc)
  with the subject and the approval text — "Place this order as GTC" by
  default — already filled in, plus the order details. Reject opens a reply
  to the reject address only, with "REJECTED BY CLIENT" in the subject.
  The mail's `Reply-To` is also set to the same team list, so a plain
  "Reply" reaches them too.
- **Execute link** — the advice mail carries the one-click gateway link
  instead (see below). No approve/reject buttons.

In Advice orders the **MODEL** control defaults to "By client setting", so a
mixed batch sends each client their own format in one go; "Email (manual)"
and "Execution (execute link)" still force one format for everyone. The
**CLIENTS** filter (All / Email approval / Execute link) narrows the group
table to one cohort when you want to work them separately, and each row
shows which cohort the client is in.

The approve/reject links are emitted as plain `Approve the order: <mailto…>`
marker lines in the message text; the Apps Script backend turns those
markers into styled buttons in the HTML mail (the same trick already used
for the execute link), so the client never sees a raw URL. **This needs the
updated backend deployed** — re-paste `Code.gs` (or Settings → "Copy backend
code") and deploy a new version, otherwise the links arrive as raw text.

## Market and limit orders, and price laddering

Advice orders can be sent at market or at a limit price:

- **Risk group** — an "Order type" selector (Market / Limit). On Limit you
  give the **first client's price** and a **tick step** (default ₹0.05). Each
  subsequent selected client is stepped one tick away so a batch doesn't
  stack identical prices on the book: **buys step up** (100.00, 100.05,
  100.10 …), **sells step down** (100.00, 99.95, 99.90 …). The ladder follows
  the table order and re-derives whenever you tick clients in or out; the
  per-client price is shown in a "Limit ₹" column before you send, and is
  floored at ₹0.01 so a long sell ladder can never cross zero.
- **Single client** — each order line has its own limit box; leave it blank
  for a market order.

The limit price flows into the email body ("Order Type: LMT", `Price:` and a
`Total Amount:` computed at the limit), the Excel export, and the gateway
execute link (sent as `orderType: LIMIT` with `price`).

Subjects are per client and name the order:
`RAMEEZ MOHAMMED (RMZ39939) — BUY IDEA 50 @ market price`, or with a limit,
`… — SELL LIQUIDCASE 862 @ 99.95`. A client with more than two lines in one
batch gets `… — 3 orders` instead.

Note that order **sizing** still uses the live market price, so a limit order
far from the market will show a quantity based on the market price.

## Order-link gateway (Advice orders)

The one-click "Click Here To Execute the Order" link sent in Advice orders is
generated by the Vasupradah order-link Gateway (a separate service at
`equity.vasupradah.com`, not part of this repo), not the old smallcase-style
link. For each client + order line, the flow is:

1. Console → `order-link-proxy` (this repo, run locally — see
   `order-link-proxy/README.md`): `POST /api/order-links` with an `orderId`
   (`<client code>-<timestamp>-<seq>`, unique per line so a client with
   several lines in one batch each gets a distinct link — the trailing
   `seq` just guards against two lines landing in the same millisecond),
   the ticker/quantity/side, and the client's WhatsApp number.
2. Proxy → Gateway: authenticates against PocketBase's `api_clients`
   collection (credentials in the proxy's own `.env`, cached for ~45 min),
   then forwards the same request to the Gateway's `POST /api/order-links`.
3. Gateway returns a link that only opens for that specific phone number
   and can't be resubmitted once the order is placed.

**Why there's a proxy at all:** the Gateway's endpoint sends no
`Access-Control-Allow-Origin` header, so a browser calling it directly is
always blocked by CORS — this can't be worked around from the console's own
JavaScript. The proxy runs the PocketBase login + Gateway call server-side
(not subject to browser CORS) and adds its own CORS headers so the console
can call *it* instead. It needs to be running (e.g. on `localhost`) whenever
you send Advice orders with execute links — Settings → Order-link gateway →
Proxy URL points the console at it.

Links are per-client (phone-gated), so unlike the old smallcase link they
can't be shared across a risk group — each client's message carries its own.
A client with no valid 10-digit WhatsApp number (or if the proxy isn't
reachable) doesn't silently lose the link — the message text says exactly
why ("Execute link unavailable (...)") instead of referencing a link that
isn't there.

**Credentials note:** the Gateway's `api_clients` email/password live only
in `order-link-proxy/.env` on whatever machine runs the proxy — the browser
console never sees them, only the proxy's own URL.
