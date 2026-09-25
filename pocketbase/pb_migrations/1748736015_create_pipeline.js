// ---- pipeline -----------------------------------------------------------------
migrate((app) => {
  const c = new Collection({
    type: "base",
    name: "pipeline",
    fields: [
      { name: "key", type: "text", required: true, max: 60 },
      { name: "name", type: "text", max: 200 },
      { name: "phone", type: "text", max: 40 },
      { name: "email", type: "text", max: 200 },
      { name: "source", type: "text", max: 60 },
      { name: "enquiry_date", type: "text", max: 10 },
      { name: "corpus", type: "number" },
      { name: "basket", type: "text", max: 100 },
      { name: "assignee", type: "text", max: 100 },
      { name: "priority", type: "text", max: 20 },
      {
        name: "stage", type: "select", maxSelect: 1, values: [
          "new", "contacted", "awaiting", "discovery", "risk", "proposal",
          "agreement", "kyc", "signed", "hold", "lost"
        ]
      },
      { name: "next_follow_up", type: "text", max: 10 },
      { name: "pan", type: "text", max: 20 },
      { name: "ckyc", type: "text", max: 40 },
      { name: "notes", type: "text", max: 4000 },
      { name: "signed_date", type: "text", max: 10 },
      { name: "kyc_docs", type: "json" },
      { name: "checklist", type: "json" },
      { name: "log", type: "json" },
      { name: "updated_ms", type: "number" },
      { name: "service", type: "text", max: 60 },
      { name: "meeting_link", type: "text", max: 500 },
      { name: "meeting_time", type: "text", max: 40 },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_pipeline_key ON pipeline (key)",
      "CREATE INDEX idx_pipeline_stage ON pipeline (stage)",
    ],
  });
  app.save(c);
}, (app) => { app.delete(app.findCollectionByNameOrId("pipeline")); });
