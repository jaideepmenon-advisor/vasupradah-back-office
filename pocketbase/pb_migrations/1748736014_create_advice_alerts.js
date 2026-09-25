// ---- advice_alerts ---------------------------------------------------------
// Replace-all snapshot of the batches the Principal Officer has pushed for
// staff to send. Cleared and rewritten each push, same as the tab was.
migrate((app) => {
  const c = new Collection({
    type: "base",
    name: "advice_alerts",
    fields: [
      { name: "batch_id", type: "text", max: 60 },
      { name: "at_ms", type: "number" },
      { name: "by", type: "text", max: 100 },
      { name: "title", type: "text", max: 200 },
      { name: "model", type: "text", max: 20 },
      { name: "side", type: "text", max: 10 },
      { name: "stock", type: "text", max: 40 },
      { name: "client_code", type: "text", max: 40 },
      { name: "client_name", type: "text", max: 200 },
      { name: "email", type: "text", max: 200 },
      { name: "whatsapp", type: "text", max: 40 },
      { name: "amount", type: "number" },
      { name: "qty", type: "number" },
      { name: "subject", type: "text", max: 300 },
      { name: "body", type: "text", max: 20000 },
      { name: "wa_body", type: "text", max: 5000 },
    ],
    indexes: [
      "CREATE INDEX idx_advice_alerts_batch ON advice_alerts (batch_id)",
    ],
  });
  app.save(c);
}, (app) => { app.delete(app.findCollectionByNameOrId("advice_alerts")); });
