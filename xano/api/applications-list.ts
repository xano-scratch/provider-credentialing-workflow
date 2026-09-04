import { query, s, ref } from "@xanots/sdk";
import { credentialingApi } from "./groups.js";
import { users } from "../tables/users.js";
import { applications } from "../tables/applications.js";
import { providers } from "../tables/providers.js";

/**
 * GET api:credentialing/applications — every case with its provider, for any
 * signed-in role (viewer included). Returns the applications and the providers
 * as two lists; the client joins them by provider_id.
 */
export const listApplicationsQuery = query({
  name: "applications",
  verb: "GET",
  apiGroup: credentialingApi,
  auth: users,
  stack: [
    s.db.query({
      table: applications,
      sort: [{ sortBy: "created_at", dir: "desc" }],
      as: "apps",
    }),
    s.db.query({
      table: providers,
      sort: [{ sortBy: "full_name", dir: "asc" }],
      as: "provs",
    }),
  ],
  response: { applications: ref("apps"), providers: ref("provs") },
});
