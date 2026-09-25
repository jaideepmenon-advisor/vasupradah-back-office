// ---- sync_log ---------------------------------------------------------------
// Mirrors the "Sync log" tab: a visible history of each GridKey run without
// needing to open the PocketBase admin UI to see whether last night's sync
// actually worked.
migrate((app) => {
  const c = new Collection({
    type: "base",
    name: "sync_log",
    fields: [
      { name: "at", type: "text", max: 40 },
      { name: "status", type: "select", maxSelect: 1, values: ["OK", "ERROR"] },
      { name: "detail", type: "text", max: 4000 },
    ],
    indexes: [
      "CREATE INDEX idx_sync_log_at ON sync_log (at)",
    ],
  });
  app.save(c);
}, (app) => { app.delete(app.findCollectionByNameOrId("sync_log")); });
