// ---- fee_plans --------------------------------------------------------------
migrate((app) => {
  const c = new Collection({
    type: "base",
    name: "fee_plans",
    fields: [
      { name: "key", type: "text", required: true, max: 60 },
      { name: "name", type: "text", required: true, max: 200 },
      { name: "mode", type: "select", maxSelect: 1, values: ["Fixed fee", "% of AUA"] },
      { name: "amount", type: "number" },
      { name: "frequency", type: "select", maxSelect: 1, values: ["Monthly", "Quarterly", "Half-yearly", "Annually", "One-time"] },
      { name: "timing", type: "select", maxSelect: 1, values: ["In advance", "In arrears"] },
      { name: "gst", type: "text", max: 60 },
      { name: "status", type: "select", maxSelect: 1, values: ["Active", "Inactive"] },
      { name: "notes", type: "text", max: 2000 },
      { name: "updated_ms", type: "number" },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_fee_plans_key ON fee_plans (key)",
      "CREATE UNIQUE INDEX idx_fee_plans_name ON fee_plans (name)",
    ],
  });
  app.save(c);
}, (app) => { app.delete(app.findCollectionByNameOrId("fee_plans")); });
