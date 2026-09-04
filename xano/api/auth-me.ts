import { query, s, ref, auth, c, expr } from "@xanots/sdk";
import { authApi } from "./groups.js";
import { users } from "../tables/users.js";

/**
 * GET api:auth/me — the current caller and their role. `auth: users` refuses a
 * request without a valid bearer token before the stack runs; inside it,
 * `auth("id")` is the caller's users row id.
 */
export const meQuery = query({
  name: "me",
  verb: "GET",
  apiGroup: authApi,
  auth: users,
  stack: [
    s.db.get({
      table: users,
      fieldName: "id",
      fieldValue: auth("id"),
      output: ["id", "name", "email", "role"],
      as: "u",
    }),
    s.precondition({
      expr: expr(ref("u", { safe: true }), "!=", c.null()),
      error_type: "notfound",
      error: c.text("Account not found."),
    }),
  ],
  response: {
    id: ref("u.id"),
    name: ref("u.name"),
    email: ref("u.email"),
    role: ref("u.role"),
  },
});
