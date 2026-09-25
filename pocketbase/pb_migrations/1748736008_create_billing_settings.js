// ---- billing_settings --------------------------------------------------------
// A singleton: exactly one record, always upserted by the fixed key
// "settings" rather than created fresh, the same way the sheet always
// cleared and rewrote its one BillingSettings row.
migrate((app) => {
  const c = new Collection({
    type: "base",
    name: "billing_settings",
    fields: [
      { name: "key", type: "text", required: true, max: 20 },
      { name: "firm_name", type: "text", max: 200 },
      { name: "firm_state", type: "text", max: 60 },
      { name: "firm_gstin", type: "text", max: 20 },
      { name: "pan", type: "text", max: 20 },
      { name: "sebi_reg", type: "text", max: 60 },
      { name: "address", type: "text", max: 500 },
      { name: "gst_rate", type: "number" },
      { name: "bank_name", type: "text", max: 200 },
      { name: "account_name", type: "text", max: 200 },
      { name: "account_number", type: "text", max: 40 },
      { name: "ifsc", type: "text", max: 20 },
      { name: "branch", type: "text", max: 200 },
      { name: "upi_id", type: "text", max: 100 },
      { name: "upi_qr", type: "text", max: 60000 },
      { name: "invoice_prefix", type: "text", max: 20 },
      { name: "receipt_prefix", type: "text", max: 20 },
      { name: "notes", type: "text", max: 2000 },
      { name: "cin", type: "text", max: 30 },
      { name: "account_type", type: "text", max: 20 },
      { name: "invoice_seed_fy", type: "text", max: 10 },
      { name: "invoice_seed_no", type: "number" },
      { name: "receipt_seed_fy", type: "text", max: 10 },
      { name: "receipt_seed_no", type: "number" },
      { name: "number_by_quarter", type: "bool" },
      { name: "cg_stcg_rate", type: "number" },
      { name: "cg_ltcg_rate", type: "number" },
      { name: "cg_ltcg_exempt", type: "number" },
      { name: "cg_cess", type: "number" },
      { name: "updated_ms", type: "number" },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_billing_settings_key ON billing_settings (key)",
    ],
  });
  app.save(c);
}, (app) => { app.delete(app.findCollectionByNameOrId("billing_settings")); });
