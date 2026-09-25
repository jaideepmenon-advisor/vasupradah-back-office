// ---- app_settings -----------------------------------------------------------
// Replaces the rest of PropertiesService: the GridKey feed URLs and token,
// the shortener provider/token, the MIS schedule, and the last-sync status
// fields. One row per key, value always a string (JSON-encode where needed)
// - exactly how PropertiesService itself only ever stored strings.
migrate((app) => {
  const c = new Collection({
    type: "base",
    name: "app_settings",
    fields: [
      { name: "key", type: "text", required: true, max: 100 },
      { name: "value", type: "text", max: 20000 },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_app_settings_key ON app_settings (key)",
    ],
  });
  app.save(c);
}, (app) => { app.delete(app.findCollectionByNameOrId("app_settings")); });
