import { table, f } from "@xanots/sdk";
import { providers } from "./providers.js";

/**
 * A provider's license or certification. Each carries an expiry the credentialing
 * rules read: within 30 days flags it expiring, already past blocks approval.
 * Timestamps are `epochms` (compared against `c.now()` in the endpoints).
 */
export const credentials = table({
  name: "credentials",
  schema: {
    provider_id: f.tableRef(providers, { required: true }),
    type: f.enum(
      ["state_license", "dea", "board_certification", "malpractice_insurance"],
      { required: true },
    ),
    identifier: f.text({ required: true }),
    issued_on: f.timestamp({ required: true }),
    expires_on: f.timestamp({ required: true }),
    status: f.enum(["active", "expired", "revoked"], { required: true }),
  },
  index: [{ type: "btree", fields: [{ name: "provider_id" }] }],
});
