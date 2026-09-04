import { workspace } from "@xanots/sdk";

// tables
import { users } from "./tables/users.js";
import { providers } from "./tables/providers.js";
import { credentials } from "./tables/credentials.js";
import { applications } from "./tables/applications.js";
import { verifications } from "./tables/verifications.js";
import { credentialingEvents } from "./tables/credentialing-events.js";

// api groups
import { authApi, credentialingApi } from "./api/groups.js";

// endpoints
import { loginQuery } from "./api/auth-login.js";
import { meQuery } from "./api/auth-me.js";
import { seedQuery } from "./api/seed.js";
import { listApplicationsQuery } from "./api/applications-list.js";
import { getApplicationQuery } from "./api/applications-get.js";
import { submitApplicationQuery } from "./api/applications-submit.js";
import { verifyCredentialQuery } from "./api/applications-verify.js";
import { advanceApplicationQuery } from "./api/applications-advance.js";
import { expiringCredentialsQuery } from "./api/credentials-expiring.js";

/**
 * Provider Credentialing Workflow — a governed Xano backend.
 *
 * A legacy credentialing workflow rebuilt as one API layer: a guarded state
 * machine, API-layer RBAC (coordinator / committee / viewer), a verification
 * gate, a credential-expiry rule, and an append-only audit trail. Every rule
 * lives in the endpoints, not the client.
 */
export default workspace("provider-credentialing-workflow")
  .registerTables([
    users,
    providers,
    credentials,
    applications,
    verifications,
    credentialingEvents,
  ])
  .registerApiGroups([authApi, credentialingApi])
  .registerQueries([
    loginQuery,
    meQuery,
    seedQuery,
    listApplicationsQuery,
    getApplicationQuery,
    submitApplicationQuery,
    verifyCredentialQuery,
    advanceApplicationQuery,
    expiringCredentialsQuery,
  ]);
