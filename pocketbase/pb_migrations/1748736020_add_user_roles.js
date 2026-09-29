/**
 * Turns on real per-person login using PocketBase's own built-in `users`
 * auth collection, in place of the one shared secret every request used to
 * carry. Two fields are added on top of what PocketBase ships by default
 * (id/password/tokenKey/email/emailVisibility/verified/name/avatar):
 *
 *   role    "admin" or "staff" - checked by pb_hooks/backend.pb.js to gate
 *           the sensitive actions (billing settings, invoices, deleting
 *           records, and managing other users' accounts) to admins only.
 *   active  a login can be switched off without deleting the account, so
 *           the person's name still appears on old records. This is
 *           enforced twice: `authRule` below rejects a NEW login attempt
 *           for a deactivated account outright, and backend.pb.js checks
 *           it again on every request, because a JWT already issued before
 *           someone was deactivated stays cryptographically valid for its
 *           full life (5 days, PocketBase's default) - authRule alone
 *           would not end an already-open session early.
 *
 * Every other rule is locked to superuser-only (null): nobody signs
 * themselves up, views, edits or deletes a `users` record through
 * PocketBase's own REST API, including their own record - every write
 * goes through backend.pb.js's `users` POST type instead (running as
 * $app, which always bypasses these rules), the same single choke point
 * every other collection in this app already goes through. Logging in
 * (POST /api/collections/users/auth-with-password) is a separate action
 * gated by `authRule`, not by these CRUD rules, so it still works with no
 * custom route needed.
 *
 * The very first admin account cannot be created this way, for the same
 * reason a fresh PocketBase install always asks you to create a superuser
 * through its own dashboard first: create it once via the PocketBase
 * dashboard (Collections -> users -> New record - set role=admin,
 * active=true, and a password) and manage every account after that
 * through the console instead.
 */
migrate((app) => {
  const collection = app.findCollectionByNameOrId("users");
  collection.fields.add(new Field({ type: "select", name: "role", required: true, maxSelect: 1, values: ["admin", "staff"] }));
  collection.fields.add(new Field({ type: "bool", name: "active" }));
  collection.listRule = null;
  collection.viewRule = null;
  collection.createRule = null;
  collection.updateRule = null;
  collection.deleteRule = null;
  collection.authRule = "active = true";
  app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("users");
  collection.fields.removeByName("role");
  collection.fields.removeByName("active");
  collection.listRule = "id = @request.auth.id";
  collection.viewRule = "id = @request.auth.id";
  collection.createRule = "";
  collection.updateRule = "id = @request.auth.id";
  collection.deleteRule = "id = @request.auth.id";
  collection.authRule = "";
  app.save(collection);
});
