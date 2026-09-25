// ---- trades -----------------------------------------------------------------
// The GridKey-fed trade book, ALREADY NORMALISED to the eight-field shape
// the console has always worked with ([date, code, name, symbol, action,
// qty, price, amount]) - the heuristic column-matching that used to run on
// every single read of the raw broker export now runs once, at ingestion,
// in pb_hooks/gridkey.pb.js. This is the ~100k-row table the whole move was
// for, so date/client_code/symbol are all indexed for the FIFO scans.
migrate((app) => {
  const c = new Collection({
    type: "base",
    name: "trades",
    fields: [
      { name: "date", type: "text", required: true, max: 10 },
      { name: "client_code", type: "text", required: true, max: 40 },
      { name: "client_name", type: "text", max: 200 },
      { name: "symbol", type: "text", required: true, max: 40 },
      { name: "action", type: "select", required: true, maxSelect: 1, values: ["BUY", "SELL"] },
      { name: "quantity", type: "number" },
      { name: "price", type: "number" },
      { name: "amount", type: "number" },
      { name: "source", type: "text", max: 20 },
    ],
    indexes: [
      "CREATE INDEX idx_trades_code_sym_date ON trades (client_code, symbol, date)",
      "CREATE INDEX idx_trades_date ON trades (date)",
    ],
  });
  app.save(c);
}, (app) => { app.delete(app.findCollectionByNameOrId("trades")); });
