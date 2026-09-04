import { query, input, s, ref, inp, auth, c, expr } from "@xanots/sdk";
import { credentialingApi } from "./groups.js";
import { users } from "../tables/users.js";
import { applications } from "../tables/applications.js";
import { providers } from "../tables/providers.js";
import { credentialingEvents } from "../tables/credentialing-events.js";

/**
 * POST api:credentialing/applications/submit — a coordinator opens a new case
 * for a provider. The role check is an API-layer guard (403 for anyone else),
 * and the open writes a `submitted` event so the audit trail starts populated.
 */
export const submitApplicationQuery = query({
  name: "applications/submit",
  verb: "POST",
  apiGroup: credentialingApi,
  auth: users,
  input: { provider_id: input.int({ required: true }) },
  stack: [
    s.db.get({
      table: users,
      fieldName: "id",
      fieldValue: auth("id"),
      output: ["id", "role"],
      as: "actor",
    }),
    s.precondition({
      expr: expr(ref("actor.role"), "=", c.text("coordinator")),
      error_type: "accessdenied",
      error: c.text("Only a coordinator can submit an application."),
    }),
    s.db.get({
      table: providers,
      fieldName: "id",
      fieldValue: inp("provider_id"),
      as: "provider",
    }),
    s.precondition({
      expr: expr(ref("provider", { safe: true }), "!=", c.null()),
      error_type: "notfound",
      error: c.text("Provider not found."),
    }),
    s.db.add({
      table: applications,
      row: {
        provider_id: inp("provider_id"),
        status: "submitted",
        submitted_by: auth("id"),
      },
      as: "app",
    }),
    s.db.add({
      table: credentialingEvents,
      row: {
        application_id: ref("app.id"),
        actor_id: auth("id"),
        action: "submitted",
        to_status: "submitted",
        detail: "Application opened.",
      },
    }),
  ],
  response: { application: ref("app") },
});
