import { apiGroup } from "@xanots/sdk";

// Canonical slugs are PINNED so the public paths are stable and getPath()
// resolves in the browser bundle from source alone (no lock needed).

/** Authentication: login + me. Path token `api:auth`. */
export const authApi = apiGroup({
  name: "auth",
  canonical: "auth",
  description: "Login and current-user for the credentialing workflow.",
});

/** The credentialing workflow surface. Path token `api:credentialing`. */
export const credentialingApi = apiGroup({
  name: "credentialing",
  canonical: "credentialing",
  description:
    "Provider credentialing: applications, verifications, the guarded lifecycle, and the expiry view.",
});
