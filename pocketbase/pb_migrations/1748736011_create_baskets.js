// ---- baskets --------------------------------------------------------------
migrate((app) => {
  const c = new Collection({
    type: "base",
    name: "baskets",
    fields: [
      { name: "key", type: "text", required: true, max: 100 },
      { name: "category", type: "text", max: 60 },
      { name: "symbol", type: "text", max: 40 },
      { name: "rationale", type: "text", max: 4000 },
      { name: "suitability", type: "text", max: 4000 },
      { name: "smallcase", type: "text", max: 200 },
      { name: "report", type: "text", max: 500 },
      { name: "updated_ms", type: "number" },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_baskets_key ON baskets (key)",
    ],
  });
  app.save(c);
}, (app) => { app.delete(app.findCollectionByNameOrId("baskets")); });
