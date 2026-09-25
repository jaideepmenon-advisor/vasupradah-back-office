// ---- order_method -------------------------------------------------------------
migrate((app) => {
  const c = new Collection({
    type: "base",
    name: "order_method",
    fields: [
      { name: "client_code", type: "text", required: true, max: 40 },
      { name: "name", type: "text", max: 200 },
      { name: "method", type: "select", maxSelect: 1, values: ["email", "gateway"] },
      { name: "updated_ms", type: "number" },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_order_method_code ON order_method (client_code)",
    ],
  });
  app.save(c);
}, (app) => { app.delete(app.findCollectionByNameOrId("order_method")); });
