// ---- holdings ---------------------------------------------------------------
// Position rows, replaced wholesale on every backup/rebuild - same as the
// Holdings tab. One row per (client_code, stock); a client with no open
// position still gets a zero-quantity row, matching how the sheet keeps a
// cash-only client visible.
migrate((app) => {
  const c = new Collection({
    type: "base",
    name: "holdings",
    fields: [
      { name: "client_code", type: "text", required: true, max: 40 },
      { name: "stock", type: "text", max: 40 },
      { name: "quantity", type: "number" },
      { name: "purchase_price", type: "number" },
      { name: "current_price", type: "number" },
      { name: "invested", type: "number" },
      { name: "current_value", type: "number" },
      { name: "pl_amount", type: "number" },
      { name: "pl_pct", type: "number" },
      // Verbatim from the sheet's "Invested set" column - carried over
      // rather than reinterpreted, since its exact meaning to the console
      // is a display flag, not something this migration should redefine.
      { name: "invested_set", type: "text", max: 40 },
      { name: "backed_up_at", type: "text", max: 40 },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_holdings_code_stock ON holdings (client_code, stock)",
      "CREATE INDEX idx_holdings_stock ON holdings (stock)",
    ],
  });
  app.save(c);
}, (app) => { app.delete(app.findCollectionByNameOrId("holdings")); });
