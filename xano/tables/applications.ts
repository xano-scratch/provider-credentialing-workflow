import { table, f } from "@xanots/sdk";
import { providers } from "./providers.js";
import { users } from "./users.js";

/**
 * One credentialing case per provider. `status` moves through the guarded
 * lifecycle enforced in `applications/{id}/advance`. `decided_by` uses the
 * `0` sentinel for "not decided yet" (an optional foreign key stores an int,
 * and a null in it is unqueryable — see the SDK fields doc).
 */
export const applications = table({
  name: "applications",
  schema: {
    provider_id: f.tableRef(providers, { required: true }),
    status: f.enum(
      [
        "submitted",
        "primary_source_verification",
        "committee_review",
        "approved",
        "denied",
        "re_credential",
      ],
      { required: true },
    ),
    submitted_by: f.tableRef(users, { required: true }),
    decided_by: f.tableRef(users, { required: true, default: 0 }),
    decision_note: f.text(),
  },
  index: [{ type: "btree", fields: [{ name: "provider_id" }] }],
});
