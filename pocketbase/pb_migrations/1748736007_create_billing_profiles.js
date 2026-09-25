// ---- billing_profiles -------------------------------------------------------
migrate((app) => {
  const c = new Collection({
    type: "base",
    name: "billing_profiles",
    fields: [
      { name: "client_code", type: "text", required: true, max: 40 },
      { name: "name", type: "text", max: 200 },
      { name: "fee_plan_key", type: "text", max: 60 },
      { name: "fee_plan_name", type: "text", max: 200 },
      { name: "residency", type: "select", maxSelect: 1, values: ["Resident", "NRI"] },
      { name: "state", type: "text", max: 60 },
      { name: "permanent_state", type: "text", max: 60 },
      { name: "gstin", type: "text", max: 20 },
      { name: "billing_start", type: "text", max: 10 },
      { name: "billing_email", type: "text", max: 200 },
      { name: "status", type: "select", maxSelect: 1, values: ["Active", "Inactive"] },
      { name: "notes", type: "text", max: 2000 },
      { name: "updated_ms", type: "number" },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_billing_profiles_code ON billing_profiles (client_code)",
    ],
  });
  app.save(c);
}, (app) => { app.delete(app.findCollectionByNameOrId("billing_profiles")); });
