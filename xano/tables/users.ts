import { table, f } from "@xanots/sdk";

/**
 * The auth table. `auth: true` lets a query name it as its `auth:` table, so a
 * bearer token minted from a users row identifies the caller and `auth("id")`
 * reads that row id inside a stack. Roles are enforced per endpoint with
 * `s.precondition` (API-layer RBAC, never row-level security).
 */
export const users = table({
  name: "users",
  auth: true,
  // `id` (int PK) + `created_at` (epochms) are auto-injected.
  schema: {
    name: f.text({ required: true }),
    email: f.email({ required: true }),
    // Hashes on write. Read it back only by naming it in a db.get `output`.
    password: f.password({ required: true }),
    role: f.enum(["coordinator", "committee", "viewer"], { required: true }),
  },
  index: [{ type: "unique", fields: [{ name: "email" }] }],
});
