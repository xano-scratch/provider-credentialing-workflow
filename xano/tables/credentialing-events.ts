import { table, f } from "@xanots/sdk";
import { applications } from "./applications.js";
import { users } from "./users.js";

/**
 * The append-only audit trail. Every move, and every BLOCKED move, writes one
 * row here (never edited, never deleted), so the case history reads as a
 * governed record: who did what, from which status to which, and why.
 */
export const credentialingEvents = table({
  name: "credentialing_events",
  schema: {
    application_id: f.tableRef(applications, { required: true }),
    actor_id: f.tableRef(users, { required: true }),
    // e.g. submitted, advanced:committee_review, verification_recorded,
    // approved, denied, transition_blocked.
    action: f.text({ required: true }),
    from_status: f.text(),
    to_status: f.text(),
    detail: f.text(),
  },
  index: [{ type: "btree", fields: [{ name: "application_id" }] }],
});
