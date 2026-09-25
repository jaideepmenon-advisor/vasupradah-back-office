// ---- advice_trace -------------------------------------------------------------
// Append-only audit log of every advice actually sent. Never cleared.
migrate((app) => {
  const c = new Collection({
    type: "base",
    name: "advice_trace",
    fields: [
      { name: "at_ms", type: "number" },
      { name: "sent_by", type: "text", max: 100 },
      { name: "channel", type: "text", max: 20 },
      { name: "batch_id", type: "text", max: 60 },
      { name: "title", type: "text", max: 200 },
      { name: "side", type: "text", max: 10 },
      { name: "stock", type: "text", max: 40 },
      { name: "client_code", type: "text", max: 40 },
      { name: "client_name", type: "text", max: 200 },
      { name: "amount", type: "number" },
      { name: "qty", type: "number" },
      { name: "model", type: "text", max: 20 },
      { name: "subject", type: "text", max: 300 },
    ],
    indexes: [
      "CREATE INDEX idx_advice_trace_batch ON advice_trace (batch_id)",
      "CREATE INDEX idx_advice_trace_at ON advice_trace (at_ms)",
    ],
  });
  app.save(c);
}, (app) => { app.delete(app.findCollectionByNameOrId("advice_trace")); });
