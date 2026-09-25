// ---- advice_contacts --------------------------------------------------------
// The mobile a client uses to open an order link, which is often NOT the
// WhatsApp number in `clients` - kept apart for that reason, same as the
// AdviceContacts tab always was.
migrate((app) => {
  const c = new Collection({
    type: "base",
    name: "advice_contacts",
    fields: [
      { name: "client_code", type: "text", required: true, max: 40 },
      { name: "name", type: "text", max: 200 },
      { name: "email", type: "text", max: 200 },
      { name: "country_code", type: "text", max: 10 },
      { name: "mobile", type: "text", max: 20 },
      { name: "risk_category", type: "text", max: 40 },
      { name: "pan", type: "text", max: 20 },
      { name: "updated_ms", type: "number" },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_advice_contacts_code ON advice_contacts (client_code)",
    ],
  });
  app.save(c);
}, (app) => { app.delete(app.findCollectionByNameOrId("advice_contacts")); });
