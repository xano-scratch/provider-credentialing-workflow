import {
  query,
  input,
  s,
  ref,
  inp,
  auth,
  c,
  col,
  expr,
  and,
  or,
  withFilters,
  fl,
} from "@xanots/sdk";
import { credentialingApi } from "./groups.js";
import { users } from "../tables/users.js";
import { applications } from "../tables/applications.js";
import { credentials } from "../tables/credentials.js";
import { verifications } from "../tables/verifications.js";
import { credentialingEvents } from "../tables/credentialing-events.js";

/**
 * POST api:credentialing/applications/{id}/advance — attempt a lifecycle move.
 *
 * This is the governed core. It enforces, in one API layer:
 *   1. Role (RBAC, API-layer): committee owns committee_review / approved /
 *      denied; a coordinator owns primary_source_verification / re_credential.
 *      Anyone else is refused 403. This is NOT row-level security.
 *   2. The state machine: only the allowed (from → to) transitions.
 *   3. The verification gate: committee_review needs every active credential
 *      verified for this case.
 *   4. The expiry rule: approval is blocked while the provider has an expired
 *      credential.
 *
 * A role failure is a hard 403. A rule failure (2-4) is a governed rejection,
 * not an error: the case is unchanged, a `transition_blocked` event is written
 * with the reason, and the endpoint answers 200 with { ok: false, reason }.
 * A success writes an `advanced:<status>` (or `approved` / `denied`) event.
 */
export const advanceApplicationQuery = query({
  name: "applications/{id}/advance",
  verb: "POST",
  apiGroup: credentialingApi,
  auth: users,
  input: {
    id: input.int({ required: true }),
    to_status: input.enum([
      "primary_source_verification",
      "committee_review",
      "approved",
      "denied",
      "re_credential",
    ]),
    note: input.text({ required: false, default: "" }),
  },
  stack: [
    // --- who is asking ---
    s.db.get({
      table: users,
      fieldName: "id",
      fieldValue: auth("id"),
      output: ["id", "role"],
      as: "actor",
    }),
    // --- which case ---
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

    // --- 1. RBAC (403 for the wrong role) ---
    s.conditional({
      when: or(
        expr(inp("to_status"), "=", c.text("committee_review")),
        expr(inp("to_status"), "=", c.text("approved")),
        expr(inp("to_status"), "=", c.text("denied")),
      ),
      then: [
        s.precondition({
          expr: expr(ref("actor.role"), "=", c.text("committee")),
          error_type: "accessdenied",
          error: c.text(
            "Only a committee member can advance to committee review, approve, or deny.",
          ),
        }),
      ],
      else: [
        s.precondition({
          expr: expr(ref("actor.role"), "=", c.text("coordinator")),
          error_type: "accessdenied",
          error: c.text(
            "Only a coordinator can start primary-source verification or re-credentialing.",
          ),
        }),
      ],
    }),

    // --- 2. state machine ---
    s.set_var("reason", c.text("")),
    s.conditional({
      when: or(
        and(
          expr(ref("app.status"), "=", c.text("submitted")),
          expr(inp("to_status"), "=", c.text("primary_source_verification")),
        ),
        and(
          expr(ref("app.status"), "=", c.text("primary_source_verification")),
          expr(inp("to_status"), "=", c.text("committee_review")),
        ),
        and(
          expr(ref("app.status"), "=", c.text("committee_review")),
          expr(inp("to_status"), "=", c.text("approved")),
        ),
        and(
          expr(ref("app.status"), "=", c.text("committee_review")),
          expr(inp("to_status"), "=", c.text("denied")),
        ),
        and(
          expr(ref("app.status"), "=", c.text("approved")),
          expr(inp("to_status"), "=", c.text("re_credential")),
        ),
        and(
          expr(ref("app.status"), "=", c.text("re_credential")),
          expr(inp("to_status"), "=", c.text("primary_source_verification")),
        ),
      ),
      then: [],
      else: [
        s.set_var(
          "reason",
          withFilters(
            c.text("This case cannot move from "),
            fl.concat(ref("app.status")),
            fl.concat(c.text(" to ")),
            fl.concat(inp("to_status")),
            fl.concat(c.text(".")),
          ),
        ),
      ],
    }),

    // --- 3. verification gate (only for committee_review, only if still ok) ---
    s.conditional({
      when: and(
        expr(ref("reason"), "=", c.text("")),
        expr(inp("to_status"), "=", c.text("committee_review")),
      ),
      then: [
        s.db.query({
          table: credentials,
          where: [
            expr(col("provider_id"), "=", ref("app.provider_id")),
            expr(col("status"), "=", c.text("active")),
          ],
          as: "active_creds",
        }),
        s.set_var("gate_ok", c.bool(true)),
        s.foreach({
          list: ref("active_creds"),
          as: "cred",
          body: [
            s.db.query({
              table: verifications,
              where: [
                expr(col("application_id"), "=", ref("app.id")),
                expr(col("credential_id"), "=", ref("cred.id")),
                expr(col("verified"), "=", c.bool(true)),
              ],
              returnType: "count",
              as: "vc",
            }),
            s.conditional({
              when: expr(ref("vc"), "=", c.int(0)),
              then: [s.set_var("gate_ok", c.bool(false))],
            }),
          ],
        }),
        s.conditional({
          when: expr(ref("gate_ok"), "=", c.bool(false)),
          then: [
            s.set_var(
              "reason",
              c.text(
                "Every active credential needs a verified primary-source record before this case can enter committee review.",
              ),
            ),
          ],
        }),
      ],
    }),

    // --- 4. expiry rule (only for approved, only if still ok) ---
    s.conditional({
      when: and(
        expr(ref("reason"), "=", c.text("")),
        expr(inp("to_status"), "=", c.text("approved")),
      ),
      then: [
        s.db.query({
          table: credentials,
          where: [
            expr(col("provider_id"), "=", ref("app.provider_id")),
            expr(col("expires_on"), "<", c.now()),
          ],
          returnType: "count",
          as: "expired_count",
        }),
        s.conditional({
          when: expr(ref("expired_count"), ">", c.int(0)),
          then: [
            s.set_var(
              "reason",
              c.text(
                "This provider has an expired credential. It must be renewed before the application can be approved.",
              ),
            ),
          ],
        }),
      ],
    }),

    // --- apply or block ---
    s.set_var("ok", c.bool(true)),
    s.set_var(
      "action_name",
      withFilters(c.text("advanced:"), fl.concat(inp("to_status"))),
    ),
    s.conditional({
      when: or(
        expr(inp("to_status"), "=", c.text("approved")),
        expr(inp("to_status"), "=", c.text("denied")),
      ),
      then: [s.update_var("action_name", inp("to_status"))],
    }),
    s.conditional({
      when: expr(ref("reason"), "=", c.text("")),
      then: [
        s.conditional({
          when: or(
            expr(inp("to_status"), "=", c.text("approved")),
            expr(inp("to_status"), "=", c.text("denied")),
          ),
          then: [
            s.db.edit({
              table: applications,
              fieldName: "id",
              fieldValue: ref("app.id"),
              row: {
                status: inp("to_status"),
                decided_by: auth("id"),
                decision_note: inp("note"),
              },
            }),
          ],
          else: [
            s.db.edit({
              table: applications,
              fieldName: "id",
              fieldValue: ref("app.id"),
              row: { status: inp("to_status") },
            }),
          ],
        }),
        s.db.add({
          table: credentialingEvents,
          row: {
            application_id: ref("app.id"),
            actor_id: auth("id"),
            action: ref("action_name"),
            from_status: ref("app.status"),
            to_status: inp("to_status"),
            detail: inp("note"),
          },
        }),
      ],
      else: [
        s.db.add({
          table: credentialingEvents,
          row: {
            application_id: ref("app.id"),
            actor_id: auth("id"),
            action: "transition_blocked",
            from_status: ref("app.status"),
            to_status: inp("to_status"),
            detail: ref("reason"),
          },
        }),
        s.set_var("ok", c.bool(false)),
      ],
    }),
  ],
  response: {
    ok: ref("ok"),
    from_status: ref("app.status"),
    to_status: inp("to_status"),
    reason: ref("reason"),
  },
});
