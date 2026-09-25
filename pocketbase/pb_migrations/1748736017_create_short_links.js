// ---- short_links ----------------------------------------------------------
migrate((app) => {
  const c = new Collection({
    type: "base",
    name: "short_links",
    fields: [
      { name: "long_url", type: "text", required: true, max: 2000 },
      { name: "short_url", type: "text", max: 200 },
      { name: "at_ms", type: "number" },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_short_links_long ON short_links (long_url)",
    ],
  });
  app.save(c);
}, (app) => { app.delete(app.findCollectionByNameOrId("short_links")); });
