import { query, input, s, ref, inp, auth, c, col, expr, withFilters, fl } from "@xanots/sdk";
import { credentialingApi } from "./groups.js";
import { users } from "../tables/users.js";
import { applications } from "../tables/applications.js";
import { credentials } from "../tables/credentials.js";
import { verifications } from "../tables/verifications.js";
import { credentialingEvents } from "../tables/credentialing-events.js";

/**
 * POST api:credentialing/applications/{id}/verify — a coordinator records a
 * primary-source verification for one credential on this case. The "source" is
 * recorded, not called live. Re-verifying the same credential updates the
 * existing record instead of adding a duplicate, so the committee-review gate
 * counts each credential once. Writes a `verification_recorded` audit event.
 */
export const verifyCredentialQuery = query({
  name: "applications/{id}/verify",
  verb: "POST",
  apiGroup: credentialingApi,
  auth: users,
  input: {
    id: input.int({ required: true }),
    credential_id: input.int({ required: true }),
    source: input.text({ required: true }),
    verified: input.bool({ required: false, default: true }),
    note: input.text({ required: false, default: "" }),
  },
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
      error: c.text("Only a coordinator can record a verification."),
    }),
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
      table: credentials,
      fieldName: "id",
      fieldValue: inp("credential_id"),
      as: "cred",
    }),
    s.precondition({
      expr: expr(ref("cred", { safe: true }), "!=", c.null()),
      error_type: "notfound",
      error: c.text("Credential not found."),
    }),
    s.precondition({
      expr: expr(ref("cred.provider_id"), "=", ref("app.provider_id")),
      error_type: "badrequest",
      error: c.text("That credential does not belong to this application's provider."),
    }),
    // Dedupe: one verification record per (application, credential).
    s.db.query({
      table: verifications,
      where: [
        expr(col("application_id"), "=", ref("app.id")),
        expr(col("credential_id"), "=", inp("credential_id")),
      ],
      returnType: "single",
      as: "existing",
    }),
    s.conditional({
      when: expr(ref("existing", { safe: true }), "=", c.null()),
      then: [
        s.db.add({
          table: verifications,
          row: {
            application_id: ref("app.id"),
            credential_id: inp("credential_id"),
            source: inp("source"),
            verified: inp("verified"),
            verified_by: auth("id"),
            note: inp("note"),
          },
        }),
      ],
      else: [
        s.db.edit({
          table: verifications,
          fieldName: "id",
          fieldValue: ref("existing.id"),
          row: {
            source: inp("source"),
            verified: inp("verified"),
            verified_by: auth("id"),
            note: inp("note"),
          },
        }),
      ],
    }),
    s.db.add({
      table: credentialingEvents,
      row: {
        application_id: ref("app.id"),
        actor_id: auth("id"),
        action: "verification_recorded",
        detail: withFilters(
          c.text("Primary-source verification recorded ("),
          fl.concat(inp("source")),
          fl.concat(c.text(")")),
        ),
      },
    }),
  ],
  response: {
    ok: c.bool(true),
    credential_id: inp("credential_id"),
    verified: inp("verified"),
  },
});
