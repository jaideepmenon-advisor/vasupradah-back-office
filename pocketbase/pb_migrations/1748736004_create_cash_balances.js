// ---- cash_balances --------------------------------------------------------
// Merges the old Cash tab and the Ledger overlay into one row per client:
// whichever sync ran last (cash, then ledger on top, same order as before)
// simply upserts this row, so "the ledger is the source of truth for cash"
// is enforced by write order rather than by a read-time overlay.
migrate((app) => {
  const c = new Collection({
    type: "base",
    name: "cash_balances",
    fields: [
      { name: "client_code", type: "text", required: true, max: 40 },
      { name: "name", type: "text", max: 200 },
      { name: "amount", type: "number" },
      { name: "status", type: "text", max: 60 },
      { name: "source", type: "select", maxSelect: 1, values: ["cash", "ledger"] },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_cash_balances_code ON cash_balances (client_code)",
    ],
  });
  app.save(c);
}, (app) => { app.delete(app.findCollectionByNameOrId("cash_balances")); });
