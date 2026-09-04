import { table, f } from "@xanots/sdk";
import { applications } from "./applications.js";
import { credentials } from "./credentials.js";
import { users } from "./users.js";

/**
 * A primary-source verification record: one credential on one application,
 * checked against a named source. The source is recorded, not called live.
 * The committee-review gate reads these: every active credential needs a
 * `verified: true` record for the application before it can advance.
 */
export const verifications = table({
  name: "verifications",
  schema: {
    application_id: f.tableRef(applications, { required: true }),
    credential_id: f.tableRef(credentials, { required: true }),
    source: f.text({ required: true }),
    verified: f.bool({ required: true }),
    verified_by: f.tableRef(users, { required: true }),
    note: f.text(),
  },
  index: [{ type: "btree", fields: [{ name: "application_id" }] }],
});
