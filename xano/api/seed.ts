import { query, s, ref, c, withFilters, fl } from "@xanots/sdk";
import { credentialingApi } from "./groups.js";
import { users } from "../tables/users.js";
import { providers } from "../tables/providers.js";
import { credentials } from "../tables/credentials.js";
import { applications } from "../tables/applications.js";
import { verifications } from "../tables/verifications.js";
import { credentialingEvents } from "../tables/credentialing-events.js";

/**
 * POST api:credentialing/seed — idempotent demo data. Truncates every table
 * (resetting id sequences) and rebuilds a browsable data set: three roles,
 * three providers, credentials including one expiring-soon and one already
 * expired, and five applications spread across the lifecycle. Public on purpose
 * so a reviewer can reset the demo. The seeded logins use `password123`.
 *
 * Expiry dates are relative to now (via epochms_add_secs), so the demo stays
 * meaningful whenever it is deployed.
 */
export const seedQuery = query({
  name: "seed",
  verb: "POST",
  apiGroup: credentialingApi,
  auth: false,
  stack: [
    // wipe
    s.db.truncate({ table: credentialingEvents, reset: true }),
    s.db.truncate({ table: verifications, reset: true }),
    s.db.truncate({ table: applications, reset: true }),
    s.db.truncate({ table: credentials, reset: true }),
    s.db.truncate({ table: providers, reset: true }),
    s.db.truncate({ table: users, reset: true }),

    // relative timestamps (seconds): -365d issued, +365d valid, +20d expiring, -40d expired
    s.set_var("t_issued", withFilters(c.now(), fl.epochms_add_secs(c.int(-31536000)))),
    s.set_var("t_valid", withFilters(c.now(), fl.epochms_add_secs(c.int(31536000)))),
    s.set_var("t_expiring", withFilters(c.now(), fl.epochms_add_secs(c.int(1728000)))),
    s.set_var("t_expired", withFilters(c.now(), fl.epochms_add_secs(c.int(-3456000)))),

    // users — one per role
    s.db.add({
      table: users,
      row: { name: "Casey Coordinator", email: "coordinator@example.com", password: "password123", role: "coordinator" },
      as: "u_coord",
    }),
    s.db.add({
      table: users,
      row: { name: "Val Committee", email: "committee@example.com", password: "password123", role: "committee" },
      as: "u_comm",
    }),
    s.db.add({
      table: users,
      row: { name: "Riley Viewer", email: "viewer@example.com", password: "password123", role: "viewer" },
      as: "u_view",
    }),

    // providers
    s.db.add({
      table: providers,
      row: { full_name: "Dr. Alice Nguyen", npi: "1234567890", specialty: "Cardiology", active: true },
      as: "p_a",
    }),
    s.db.add({
      table: providers,
      row: { full_name: "Dr. Ben Carter", npi: "2345678901", specialty: "Radiology", active: true },
      as: "p_b",
    }),
    s.db.add({
      table: providers,
      row: { full_name: "Dr. Carla Diaz", npi: "3456789012", specialty: "Pediatrics", active: true },
      as: "p_c",
    }),

    // credentials — provider A: license valid, board cert expiring soon
    s.db.add({
      table: credentials,
      row: { provider_id: ref("p_a.id"), type: "state_license", identifier: "CA-SL-44821", issued_on: ref("t_issued"), expires_on: ref("t_valid"), status: "active" },
      as: "c_a1",
    }),
    s.db.add({
      table: credentials,
      row: { provider_id: ref("p_a.id"), type: "board_certification", identifier: "ABIM-556201", issued_on: ref("t_issued"), expires_on: ref("t_expiring"), status: "active" },
      as: "c_a2",
    }),
    // provider B: license valid, DEA already expired
    s.db.add({
      table: credentials,
      row: { provider_id: ref("p_b.id"), type: "state_license", identifier: "NY-SL-77310", issued_on: ref("t_issued"), expires_on: ref("t_valid"), status: "active" },
      as: "c_b1",
    }),
    s.db.add({
      table: credentials,
      row: { provider_id: ref("p_b.id"), type: "dea", identifier: "BC-3391208", issued_on: ref("t_issued"), expires_on: ref("t_expired"), status: "expired" },
      as: "c_b2",
    }),
    // provider C: license valid, malpractice valid
    s.db.add({
      table: credentials,
      row: { provider_id: ref("p_c.id"), type: "state_license", identifier: "TX-SL-10265", issued_on: ref("t_issued"), expires_on: ref("t_valid"), status: "active" },
      as: "c_c1",
    }),
    s.db.add({
      table: credentials,
      row: { provider_id: ref("p_c.id"), type: "malpractice_insurance", identifier: "MPL-2026-8890", issued_on: ref("t_issued"), expires_on: ref("t_valid"), status: "active" },
      as: "c_c2",
    }),

    // applications across the lifecycle
    s.db.add({
      table: applications,
      row: { provider_id: ref("p_a.id"), status: "committee_review", submitted_by: ref("u_coord.id") },
      as: "app_a",
    }),
    s.db.add({
      table: applications,
      row: { provider_id: ref("p_b.id"), status: "committee_review", submitted_by: ref("u_coord.id") },
      as: "app_b",
    }),
    s.db.add({
      table: applications,
      row: { provider_id: ref("p_c.id"), status: "primary_source_verification", submitted_by: ref("u_coord.id") },
      as: "app_c",
    }),
    s.db.add({
      table: applications,
      row: { provider_id: ref("p_a.id"), status: "submitted", submitted_by: ref("u_coord.id") },
      as: "app_d",
    }),
    s.db.add({
      table: applications,
      row: { provider_id: ref("p_c.id"), status: "approved", submitted_by: ref("u_coord.id"), decided_by: ref("u_comm.id"), decision_note: "All credentials verified and current." },
      as: "app_e",
    }),

    // verifications — app A (both active creds), app B (its active license), app E (both)
    s.db.add({ table: verifications, row: { application_id: ref("app_a.id"), credential_id: ref("c_a1.id"), source: "State Medical Board", verified: true, verified_by: ref("u_coord.id") } }),
    s.db.add({ table: verifications, row: { application_id: ref("app_a.id"), credential_id: ref("c_a2.id"), source: "ABMS", verified: true, verified_by: ref("u_coord.id") } }),
    s.db.add({ table: verifications, row: { application_id: ref("app_b.id"), credential_id: ref("c_b1.id"), source: "State Medical Board", verified: true, verified_by: ref("u_coord.id") } }),
    s.db.add({ table: verifications, row: { application_id: ref("app_e.id"), credential_id: ref("c_c1.id"), source: "State Medical Board", verified: true, verified_by: ref("u_coord.id") } }),
    s.db.add({ table: verifications, row: { application_id: ref("app_e.id"), credential_id: ref("c_c2.id"), source: "Insurer Certificate", verified: true, verified_by: ref("u_coord.id") } }),

    // audit trails
    // app A: submitted -> psv -> verifications -> committee_review
    s.db.add({ table: credentialingEvents, row: { application_id: ref("app_a.id"), actor_id: ref("u_coord.id"), action: "submitted", to_status: "submitted", detail: "Application opened." } }),
    s.db.add({ table: credentialingEvents, row: { application_id: ref("app_a.id"), actor_id: ref("u_coord.id"), action: "advanced:primary_source_verification", from_status: "submitted", to_status: "primary_source_verification" } }),
    s.db.add({ table: credentialingEvents, row: { application_id: ref("app_a.id"), actor_id: ref("u_coord.id"), action: "verification_recorded", detail: "Primary-source verification recorded (State Medical Board)" } }),
    s.db.add({ table: credentialingEvents, row: { application_id: ref("app_a.id"), actor_id: ref("u_coord.id"), action: "verification_recorded", detail: "Primary-source verification recorded (ABMS)" } }),
    s.db.add({ table: credentialingEvents, row: { application_id: ref("app_a.id"), actor_id: ref("u_comm.id"), action: "advanced:committee_review", from_status: "primary_source_verification", to_status: "committee_review" } }),
    // app B: submitted -> psv -> verification -> committee_review (approval will be blocked by the expired DEA)
    s.db.add({ table: credentialingEvents, row: { application_id: ref("app_b.id"), actor_id: ref("u_coord.id"), action: "submitted", to_status: "submitted", detail: "Application opened." } }),
    s.db.add({ table: credentialingEvents, row: { application_id: ref("app_b.id"), actor_id: ref("u_coord.id"), action: "advanced:primary_source_verification", from_status: "submitted", to_status: "primary_source_verification" } }),
    s.db.add({ table: credentialingEvents, row: { application_id: ref("app_b.id"), actor_id: ref("u_coord.id"), action: "verification_recorded", detail: "Primary-source verification recorded (State Medical Board)" } }),
    s.db.add({ table: credentialingEvents, row: { application_id: ref("app_b.id"), actor_id: ref("u_comm.id"), action: "advanced:committee_review", from_status: "primary_source_verification", to_status: "committee_review" } }),
    // app C: submitted -> psv (not yet verified; committee_review will be gate-blocked)
    s.db.add({ table: credentialingEvents, row: { application_id: ref("app_c.id"), actor_id: ref("u_coord.id"), action: "submitted", to_status: "submitted", detail: "Application opened." } }),
    s.db.add({ table: credentialingEvents, row: { application_id: ref("app_c.id"), actor_id: ref("u_coord.id"), action: "advanced:primary_source_verification", from_status: "submitted", to_status: "primary_source_verification" } }),
    // app D: submitted
    s.db.add({ table: credentialingEvents, row: { application_id: ref("app_d.id"), actor_id: ref("u_coord.id"), action: "submitted", to_status: "submitted", detail: "Application opened." } }),
    // app E: full history through approval
    s.db.add({ table: credentialingEvents, row: { application_id: ref("app_e.id"), actor_id: ref("u_coord.id"), action: "submitted", to_status: "submitted", detail: "Application opened." } }),
    s.db.add({ table: credentialingEvents, row: { application_id: ref("app_e.id"), actor_id: ref("u_coord.id"), action: "advanced:primary_source_verification", from_status: "submitted", to_status: "primary_source_verification" } }),
    s.db.add({ table: credentialingEvents, row: { application_id: ref("app_e.id"), actor_id: ref("u_coord.id"), action: "verification_recorded", detail: "Primary-source verification recorded (State Medical Board)" } }),
    s.db.add({ table: credentialingEvents, row: { application_id: ref("app_e.id"), actor_id: ref("u_comm.id"), action: "advanced:committee_review", from_status: "primary_source_verification", to_status: "committee_review" } }),
    s.db.add({ table: credentialingEvents, row: { application_id: ref("app_e.id"), actor_id: ref("u_comm.id"), action: "approved", from_status: "committee_review", to_status: "approved", detail: "All credentials verified and current." } }),
  ],
  response: {
    ok: c.bool(true),
    users: c.int(3),
    providers: c.int(3),
    credentials: c.int(6),
    applications: c.int(5),
  },
});
