// ---- staff --------------------------------------------------------------------
// Was a JSON blob in Apps Script's PropertiesService; one row per name now.
migrate((app) => {
  const c = new Collection({
    type: "base",
    name: "staff",
    fields: [
      { name: "name", type: "text", required: true, max: 100 },
      { name: "enabled", type: "bool" },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_staff_name ON staff (name)",
    ],
  });
  app.save(c);
}, (app) => { app.delete(app.findCollectionByNameOrId("staff")); });
