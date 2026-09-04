import { query, input, s, ref, inp, c, expr, obj } from "@xanots/sdk";
import { authApi } from "./groups.js";
import { users } from "../tables/users.js";

/**
 * POST api:auth/login — email + password, returns a bearer token.
 *
 * The password comes in as `input.text` (NOT `input.password`): an
 * `f.password()` column hashes on write and `input.password` would hash the
 * submission too, so `check_password` would compare two different hashes and a
 * correct password would always fail. The db.get names `password` in `output`
 * because the column is `access: "internal"` and is otherwise absent from the row.
 */
export const loginQuery = query({
  name: "login",
  verb: "POST",
  apiGroup: authApi,
  input: {
    email: input.text({ required: true, methods: ["trim", "lower"] }),
    password: input.text({ required: true }),
  },
  stack: [
    s.db.get({
      table: users,
      fieldName: "email",
      fieldValue: inp("email"),
      output: ["id", "name", "email", "role", "password"],
      as: "u",
    }),
    s.precondition({
      expr: expr(ref("u", { safe: true }), "!=", c.null()),
      error_type: "notfound",
      error: c.text("No account matches that email."),
    }),
    s.security.check_password({
      text_password: inp("password"),
      hash_password: ref("u.password"),
      as: "ok",
    }),
    s.precondition({
      expr: expr(ref("ok"), "=", c.bool(true)),
      error_type: "unauthorized",
      error: c.text("That password does not match."),
    }),
    s.security.create_auth_token({ table: users, id: ref("u.id"), as: "token" }),
  ],
  response: {
    token: ref("token"),
    user: obj({
      id: ref("u.id"),
      name: ref("u.name"),
      email: ref("u.email"),
      role: ref("u.role"),
    }),
  },
});
