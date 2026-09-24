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

## Signing in: the Principal Officer and staff

The Principal Officer signs in with the admin name plus a PIN. Everyone else
types the name the Principal Officer enabled for them in **Settings → Staff
access**; there is no separate password.

How a staff name is checked:

1. **The office Google Sheet is the authority.** When the device is connected,
   the sign-in screen asks the sheet who is enabled (`?staff=1`) and uses that
   answer. So a name enabled a minute ago works immediately, and one that has
   been turned off stops working, on every device.
2. **If the sheet can't be reached**, it falls back to the list already saved
   on that device, so a bad connection never strands anyone who has signed in
   before.
3. **Names are matched forgivingly** — leading/trailing spaces, repeated
   spaces, and capitalisation are all ignored. "kavya  jaigopal " signs in
   against a stored "Kavya Jaigopal".

Every change in Settings → Staff access (add, enable, disable, remove) is
published to the sheet on the spot. It used to ride along with the next full
backup, which meant a new joiner could not sign in from their own device until
one happened, and a name that had just been turned off still could.

A staff member setting up a new device uses **Connect to office sheet** at the
bottom of the sign-in screen and pastes the Web app URL and Secret from the
Principal Officer. Until that is done the device has no way to check who is
enabled, and it says so rather than claiming the name isn't allowed.

**This needs the updated backend deployed.** `?staff=1` and the staff-only POST
live in `Code.gs` — re-paste it (or Settings → "Copy backend code") and deploy a
new version. Until then the console falls back to the old, much slower lookup,
which still works but keeps the sign-in button spinning while it pulls the whole
trade book.

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

## Billing

The **Billing** tab runs the quarterly fee cycle end to end: fee plans, who is on
which plan, the quarter's bills, sending them, and the receipt once the money
lands. Five sections, in the order you use them.

### How a quarter is billed

Fees are billed for a quarter once it has run. Quarters are Indian
financial-year quarters, and each has its own **bill date**, which is the date
the invoice carries:

| Quarter | Period | Billed on |
| --- | --- | --- |
| Q1 | Apr–Jun | 1 July |
| Q2 | Jul–Sep | 1 October |
| Q3 | Oct–Dec | 1 January |
| Q4 | Jan–Mar | **31 March** |

The year's last quarter is billed on 31 March itself rather than 1 April, so
that bill stays inside the financial year it belongs to — its number, its GST
return and the books all fall in the right year.

A bill is dated its quarter's bill date, not the day you press the button, so
running a quarter a few days late does not drift the date or the series.

Two kinds of client:

- **Already on the books** — the full quarterly fee.
- **Joined during the quarter** — charged **from the date of their first executed
  trade**, pro rata on days. The date comes from the trade book itself: a
  `?first_trades=1` endpoint scans the `Trades` and `ManualTrades` tabs on the
  sheet and returns one date per client code, so the whole ~100k-row book never
  has to travel to the browser. A client with no executed trade is **not billed**,
  and the run says so by name.

The pro rata is `quarterly fee × days billed ÷ days in that quarter`, on the real
length of the quarter (91 days for Apr–Jun, 90 for Jan–Mar). A plan on any other
frequency is converted first: monthly × 3, half-yearly ÷ 2, annual ÷ 4. A
percentage-of-AUA plan is charged on the client's portfolio value plus cash.

**Billing start** on a client's profile overrides the trade book — for an account
transferred in with history, or a fee holiday.

### GST

The firm's own state is set in **Bank & GST**. Each client's **place of supply**
decides the split:

- same state as the firm → **CGST + SGST**, half the rate each
- another Indian state → **IGST**, the full rate on one line
- outside India → **zero-rated export**, no GST

Both taxes appear as separate lines on the bill, and the halves are rounded so
they add back to the exact tax.

For an **NRI**, the place of supply is their **permanent residence state** — a
field of its own on the billing profile, separate from where they live now —
because that Indian address is what the place-of-supply rules look to. An NRI
genuinely outside India can be marked as such and is zero-rated instead. A client
with no state set is flagged rather than silently billed at nil.

### Invoice numbers

One unbroken series per financial year, starting again at 1 each April:
`VIAS/2026-27/001`. The series follows the **year the invoice is dated in**,
which is what GST Rule 46 requires — so the Q4 bill dated 31 March is the last
number of the old year, and Q1 dated 1 July starts the new one.

Moving over from an existing series? In **Bank & GST → Invoice and receipt
numbers**, enter the next number to use and the financial year it applies to. If
your last bill this year was 47, put 48 and the first bill from the console takes
it. The seed applies to that one year only; the next April starts at 1 by itself.
It can never pull the series backwards. Receipts have their own seed. The screen
shows what the next number will be.

If you would rather see the quarter in the number too
(`VIAS/2026-27/Q1/001`), there is a switch for it on the same screen.

### Auto-generation

The first time the console is opened on or after a quarter's bill date, that
quarter's bills generate on their own — no click. A dot appears on the **Billing** tab in the nav
until it has happened. Generating does **not** send anything: the bills sit there
for you to look at, and nothing leaves until you press the email button.

Re-running is safe. **Generate** only adds clients who do not already have a bill
for that quarter, so you can fix a missing fee plan and run it again without
billing anyone twice. A bill generated in error can be deleted; one already
emailed is **cancelled** instead, keeping its number on record.

### Sending

- **Email all unsent** sends every bill in one click, one personalised mail per
  client, each with its own amount, GST split and payment details. **The bill is
  the body of the mail**, so the client sees it without opening anything, and the
  same bill is attached as a **PDF** to keep. Individual bills can be re-sent any
  time from the row or the preview.
- **WhatsApp** opens each client's chat with a short note: the amount, that the
  bill has gone to their registered email and on what date, and how to pay. It
  deliberately does not repeat the bill itself.
- Every bill can be viewed on screen and printed or saved as PDF.

### Where clients pay

**Bank & GST** holds the one account clients may pay into — account name, bank,
account number and type, IFSC, branch and UPI id. It is printed on every bill and
repeated in the WhatsApp note, each time with a line telling the client to pay
nowhere else.

Each bill carries its **own UPI QR, already filled in with that client's amount
and invoice number** — they scan and pay, with nothing to type and no chance of
paying the wrong sum against the wrong bill. The QR is a standard
`upi://pay?pa=…&am=…&tn=…&cu=INR` intent, drawn in the browser (the QR encoder is
bundled into the file, so nothing is fetched at runtime) and sent as an **inline
image**, because Gmail strips `data:` URLs out of `<img src>`. A static QR can
still be uploaded as a fallback for a firm with no UPI id; if there is neither,
the bill simply shows no QR.

Format checks warn — but never block — on the GSTIN, PAN, CIN, IFSC and UPI id,
since a wrong one is painful to discover from a client.

### Payment and receipts

When the credit shows in the bank, staff open the bill and **Mark paid**: the date
the credit appeared, the mode, and the bank reference. That produces a numbered
receipt whose **date is the day the entry was made** — the day the firm is
certifying it, not the day the money moved; both dates appear on the receipt,
along with who entered it. Receipts can be emailed or WhatsApped, singly or
re-sent later, from the **Receipts** section.

### What is stored where

| Tab | Holds |
| --- | --- |
| `FeePlans` | the fee plans |
| `BillingProfiles` | which plan each client is on, residency, state, permanent state, GSTIN, billing start |
| `BillingSettings` | the firm's GST details and the one payee account, including the QR |
| `Invoices` | every bill, its GST split, and its receipt once paid |

All four sync newest-wins like the rest of the console. Everyone can see billing;
only the Principal Officer can change plans, profiles, settings, or send.

**This needs the updated backend deployed** — `?first_trades=1`,
`?billing_profiles=1`, `?billing_settings=1`, `?invoices=1` and the matching
POSTs, plus `billing_email`, all live in `Code.gs`.

### Fee plan setup

The firm's fee plans. Everything else in billing hangs off a plan, so the list
has to exist before anything can be billed.

Plans are stored in the Google Sheet's **`FeePlans`** tab
(`id | Name | Mode | Amount | Frequency | Timing | GST | Status | Notes | Updated at`)
and mirrored in the browser, so the list survives a device reset and reaches
other staff on the next team sync. Rows are upserted by `id`, and a plan leaves
the sheet only when you delete it — never because a device turned up with an
empty local copy.

Each plan carries:

| Field | What it is |
| --- | --- |
| Name | What you'll pick from later, e.g. "Fixed Fee 15000 Per Quarter" |
| Fee mode | `Fixed fee` or `% of AUA` — the two modes the SEBI IA Regulations allow |
| Amount | Rupees per period, or the percentage per period |
| Billing frequency | Monthly / Quarterly / Half-yearly / Annually / One-time |
| Billed | In advance or in arrears |
| GST | GST extra / GST inclusive / No GST |
| Status | Active or Inactive — retired plans stay on file and sort to the bottom |
| Notes | Anything the team should know before putting a client on the plan |

The list shows each plan's **annualised** figure (amount × periods per year) and
checks it against the **SEBI fee cap** — ₹1,51,000 a year per family on fixed
fees, or 2.5% of Assets under Advice. A plan over the cap is flagged, in the
editor and in the list, but still saves: the cap applies to everything a family
is charged in a year, not to a single plan, so this is a prompt to check rather
than a block.

Everyone can see the fee plans; only the Principal Officer can create, edit or
delete them. On an empty setup there's a one-click button to add the nine plans
already in use. **Load from sheet** / **Save all to sheet** cover a restore or a
bulk push.

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
  to `jaideepmenon@` with `kavyajaigopal@` and `minicr@` in Cc (same
  first-is-To rule), with "REJECTED BY CLIENT" in the subject — the dealer
  is deliberately not copied on a rejection.
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

### When there is no live price

Sizing needs a price, and the feed doesn't carry every scrip. Rather than
leave the quantity blank, you can type the current market price yourself:

- **Risk group** — a "Market price for `<SYMBOL>` (₹)" box sits under the
  research report link. It shows the live price when there is one (override
  it if you want) and is the only source of a price when there isn't; the
  line underneath says which is in use.
- **Single client** — any symbol in the order lines with no live price gets
  its own price box in an amber strip above "Add order line".

A price typed here is used for quantity, the order value, the email body and
the Excel export, exactly as a live price would be. It is not written back to
the price feed, and it is cleared with the draft.

### The advice being worked on is auto-saved

An advice order in progress is kept in the browser as you type, so moving to
Portfolio Report (or any other tab) and back, or reloading the page, no
longer loses it — you'll see "Picked up the advice order you had in
progress" when it is restored. **Clear draft** in the top-right of Advice
orders removes it and empties the form. The sizing rules above the order
(minimum cash, order size %, caps, PIS settings) are standing preferences and
are left alone by Clear. Nothing is sent to the sheet — the draft lives in
that one browser only.

## Advice contacts (order-link login numbers)

A client often opens the order link with a **different mobile from the
WhatsApp number in Holdings**, and the link only opens for the number it was
tagged with. So the two are kept apart:

- **Holdings → WhatsApp column** — used for WhatsApp alerts. Unchanged.
- **`AdviceContacts` tab** — the mobile used to open an order link. When a
  client has a row here, order links are tagged with that number; otherwise
  the WhatsApp number is used as before.

Upload it in **Upload Data → Advice contacts (order-link logins)** from a
`.xlsx` or `.csv` with these columns, in this order:

```
client code | client name | email id | country code | mobile number | risk category | PAN number
```

The country code goes in its own column and is joined to the mobile on
import (`91` + `9847012345` -> `+919847012345`); `+91` and `0091` are
accepted, and a file without the country-code column still reads as the
original six. A header row is optional — columns are matched by name when a
header is present and by position when it isn't. The preview shows how many rows
carry a mobile, how many differ from the WhatsApp number on file, and how
many client codes aren't recognised, before anything is saved. Rows are
upserted by client code into the sheet, so re-uploading corrects rows rather
than duplicating them.

Only the **mobile** changes behaviour today; name, email, risk and PAN are
stored alongside it for reference and do not override the client master.

Numbers are accepted worldwide — anything 8 to 15 digits. Indian numbers are
handed to the gateway as the bare 10 digits they have always been sent as
(and that clients type to open their link); every other country goes as
E.164 with a leading `+`, the form the gateway was verified to accept
(`+97455471305` returned a working link). Note the number the link is tagged
with is the number the client must enter, so changing India's format would
mean re-testing that clients can still open their links.

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
