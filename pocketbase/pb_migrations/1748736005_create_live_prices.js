// ---- live_prices ----------------------------------------------------------
// Replaces "Sheet1". Populated from two places: the CMP column that rides
// along with the combined-holdings feed (ported as-is), and a plain
// POST /exec {type:"prices"} for whatever else fed Sheet1 before - a
// GOOGLEFINANCE-backed sheet, a paid quote API, or a manual paste. That
// choice is the firm's, not this migration's - see the README.
migrate((app) => {
  const c = new Collection({
    type: "base",
    name: "live_prices",
    fields: [
      { name: "symbol", type: "text", required: true, max: 40 },
      { name: "price", type: "number" },
      { name: "source", type: "text", max: 40 },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_live_prices_symbol ON live_prices (symbol)",
    ],
  });
  app.save(c);
}, (app) => { app.delete(app.findCollectionByNameOrId("live_prices")); });
