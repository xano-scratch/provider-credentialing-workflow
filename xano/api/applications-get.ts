import { query, input, s, ref, inp, c, col, expr } from "@xanots/sdk";
import { credentialingApi } from "./groups.js";
import { users } from "../tables/users.js";
import { applications } from "../tables/applications.js";
import { providers } from "../tables/providers.js";
import { credentials } from "../tables/credentials.js";
import { verifications } from "../tables/verifications.js";
import { credentialingEvents } from "../tables/credentialing-events.js";

/**
 * GET api:credentialing/applications/{id} — one case with everything the detail
 * view reads: the provider, the provider's credentials, the verification
 * records, the full audit trail (append-only, oldest first), and the users so
 * the client can name each actor. Any signed-in role may read.
 */
export const getApplicationQuery = query({
  name: "applications/{id}",
  verb: "GET",
  apiGroup: credentialingApi,
  auth: users,
  input: { id: input.int({ required: true }) },
  stack: [
    s.db.get({
      table: applications,
      fieldName: "id",
      fieldValue: inp("id"),
      as: "app",
    }),
    s.precondition({
      expr: expr(ref("app", { safe: true }), "!=", c.null()),
      error_type: "notfound",
      error: c.text("Application not found."),
    }),
    s.db.get({
      table: providers,
      fieldName: "id",
      fieldValue: ref("app.provider_id"),
      as: "provider",
    }),
    s.db.query({
      table: credentials,
      where: expr(col("provider_id"), "=", ref("app.provider_id")),
      sort: [{ sortBy: "expires_on", dir: "asc" }],
      as: "creds",
    }),
    s.db.query({
      table: verifications,
      where: expr(col("application_id"), "=", ref("app.id")),
      as: "vers",
    }),
    s.db.query({
      table: credentialingEvents,
      where: expr(col("application_id"), "=", ref("app.id")),
      sort: [{ sortBy: "id", dir: "asc" }],
      as: "events",
    }),
    s.db.query({ table: users, output: ["id", "name", "role"], as: "usersList" }),
  ],
  response: {
    application: ref("app"),
    provider: ref("provider"),
    credentials: ref("creds"),
    verifications: ref("vers"),
    events: ref("events"),
    users: ref("usersList"),
  },
});
