/**
 * Vasupradah back office - initial schema.
 *
 * Mirrors the tabs of the "ADVISORY CLIENT DATA" Google Sheet one for one,
 * with two deliberate simplifications over the sheet:
 *
 *   1. Holdings-tab client master fields (name/email/whatsapp/risk) and the
 *      ClientDetails tab (pan/address/phone/notes) are ONE `clients` record
 *      per client code, instead of two tables both keyed on code that had
 *      to be kept in step by hand on every holdings rebuild.
 *   2. The raw CombinedHoldings/Cash/Ledger CSV caches are not kept as
 *      their own tables - the sync ingests them straight into `holdings`
 *      and `cash_balances`, the same way the sheet's own rebuild functions
 *      already parsed them on the fly. `sync_log` keeps the visible history
 *      the "Sync log" tab gave you.
 *
 * Everywhere else, a table here is the same tab, same columns, same upsert
 * key, so the numbers this produces should match the sheet exactly for the
 * same input - which is what the test suite in pocketbase/tests checks.
 *
 * PocketBase always adds its own `id` (15-char random text) as the primary
 * key. Where the app needs a STABLE id to upsert by (an invoice number, a
 * client code, a fee plan), that lives in a plain unique field alongside it
 * rather than fighting PocketBase's own id format - `client_code`, `key`,
 * `symbol`, `name` and so on below are those fields, and every read/write
 * route in pb_hooks/api.pb.js goes through them, never through PocketBase's
 * internal id.
 *
 * One PocketBase migration file = one migrate() call, hence twenty files
 * instead of one - a second migrate() call in the same file is silently
 * ignored (checked empirically against 0.40.4, not assumed).
 */
// ---- clients --------------------------------------------------------------
// One record per client code. Holdings' master columns (name/email/whatsapp/
// risk) and the old ClientDetails tab (pan/address/phone/notes) merged into
// one place, so there is nothing left to keep in step across two tables.
migrate((app) => {
  const c = new Collection({
    type: "base",
    name: "clients",
    fields: [
      { name: "code", type: "text", required: true, max: 40 },
      { name: "name", type: "text", max: 200 },
      { name: "email", type: "text", max: 200 },
      { name: "whatsapp", type: "text", max: 40 },
      { name: "risk_category", type: "text", max: 40 },
      // NRE / NRO / PIS / etc, as free text off the ledger/cash feed - kept
      // as text rather than a select since the feed's own wording varies.
      { name: "status", type: "text", max: 60 },
      { name: "pan", type: "text", max: 20 },
      { name: "address", type: "text", max: 1000 },
      { name: "phone", type: "text", max: 40 },
      { name: "notes", type: "text", max: 4000 },
      { name: "updated_ms", type: "number" },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_clients_code ON clients (code)",
    ],
  });
  app.save(c);
}, (app) => { app.delete(app.findCollectionByNameOrId("clients")); });
