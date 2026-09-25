// ---- manual_trades ------------------------------------------------------
// Kept as its OWN table, never touched by the GridKey ingest, for the same
// reason the sheet kept ManualTrades separate: a hand-entered opening
// position (or a correction) must survive every automated sync. Reads that
// need the whole book (capital gains, the gap scan, first-trade) union this
// with `trades`, exactly as gkNormalizedTrades_() used to.
migrate((app) => {
  const c = new Collection({
    type: "base",
    name: "manual_trades",
    fields: [
      { name: "key", type: "text", required: true, max: 100 },
      { name: "date", type: "text", max: 10 },
      { name: "client_code", type: "text", max: 40 },
      { name: "client_name", type: "text", max: 200 },
      { name: "symbol", type: "text", max: 40 },
      { name: "action", type: "select", maxSelect: 1, values: ["BUY", "SELL"] },
      { name: "quantity", type: "number" },
      { name: "price", type: "number" },
      { name: "amount", type: "number" },
      { name: "note", type: "text", max: 500 },
      { name: "entered_by", type: "text", max: 100 },
      { name: "entered_at_ms", type: "number" },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_manual_trades_key ON manual_trades (key)",
      "CREATE INDEX idx_manual_trades_code_sym ON manual_trades (client_code, symbol)",
    ],
  });
  app.save(c);
}, (app) => { app.delete(app.findCollectionByNameOrId("manual_trades")); });
