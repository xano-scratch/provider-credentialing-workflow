import { query, s, ref, c, col, expr, withFilters, fl } from "@xanots/sdk";
import { credentialingApi } from "./groups.js";
import { users } from "../tables/users.js";
import { credentials } from "../tables/credentials.js";
import { providers } from "../tables/providers.js";

/**
 * GET api:credentialing/credentials/expiring — the governance view: credentials
 * that expire within 30 days or are already past. The 30-day cutoff is computed
 * at request time into a set_var and the column is compared against that bound
 * value; the relative-time filter (epochms_add_secs) has no SQL form, so it must
 * NOT sit inline in the WHERE (it would deploy clean and then 500). A bare
 * c.now() operand IS SQL-safe, which is why the "expired" side needs no var.
 */
export const expiringCredentialsQuery = query({
  name: "credentials/expiring",
  verb: "GET",
  apiGroup: credentialingApi,
  auth: users,
  stack: [
    // now + 30 days (2,592,000 seconds), computed in the request, not in SQL.
    s.set_var(
      "cutoff",
      withFilters(c.now(), fl.epochms_add_secs(c.int(2592000))),
    ),
    s.db.query({
      table: credentials,
      where: expr(col("expires_on"), "<=", ref("cutoff")),
      sort: [{ sortBy: "expires_on", dir: "asc" }],
      as: "creds",
    }),
    s.db.query({ table: providers, as: "provs" }),
  ],
  response: { credentials: ref("creds"), providers: ref("provs") },
});
