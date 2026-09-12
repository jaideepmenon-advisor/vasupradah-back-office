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
  appsscript.json                Apps Script manifest (best-effort defaults —
                                  check it against your actual deployment's
                                  Project Settings before relying on it).
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
- **These two pieces are independent deployments.** The console still carries
  its own embedded copy of the backend source (`APPS_SCRIPT` constant, shown
  under Settings → Google Sheet backup → "Copy backend code") so a user can
  copy-paste it straight into the Apps Script editor without leaving the app.
  `Code.gs` here is that same source, extracted so it can be read and
  version-controlled normally. **If you change the backend logic, update both
  copies** — there's no build step wiring them together yet.

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
