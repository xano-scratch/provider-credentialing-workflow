// The one contract. Every path, request body, and response type here is derived
// from the xanots query defs in ../../../xano/api/* — never hand-typed. Change a
// def and this file (and every screen that uses it) follows or fails to compile.
//
// These defs carry no heavy graph (no s.ai.agent.run), so importing them for
// getPath()/verb is fine; the ~267 kB SDK runtime floor is shared across all of
// them. Types (InferInput/InferResponse) erase to nothing.

import type { InferInput, InferResponse } from "@xanots/sdk";

import { loginQuery } from "../../../xano/api/auth-login.js";
import { meQuery } from "../../../xano/api/auth-me.js";
import { seedQuery } from "../../../xano/api/seed.js";
import { listApplicationsQuery } from "../../../xano/api/applications-list.js";
import { getApplicationQuery } from "../../../xano/api/applications-get.js";
import { submitApplicationQuery } from "../../../xano/api/applications-submit.js";
import { verifyCredentialQuery } from "../../../xano/api/applications-verify.js";
import { advanceApplicationQuery } from "../../../xano/api/applications-advance.js";
import { expiringCredentialsQuery } from "../../../xano/api/credentials-expiring.js";

/**
 * The deployed Xano backend's base URL. Injected as `window.XANO_HOST` by
 * `xanots deploy --static`, or read from `VITE_XANO_HOST` in local dev.
 */
export const XANO_HOST: string =
  (typeof window !== "undefined" && (window as { XANO_HOST?: string }).XANO_HOST) ||
  import.meta.env.VITE_XANO_HOST ||
  "";

// ── Types derived from the defs ─────────────────────────────────────────────
export type LoginBody = InferInput<typeof loginQuery>;
export type LoginResponse = InferResponse<typeof loginQuery>;
export type MeResponse = InferResponse<typeof meQuery>;

export type ListResponse = InferResponse<typeof listApplicationsQuery>;
export type Application = ListResponse["applications"][number];
export type Provider = ListResponse["providers"][number];

export type DetailResponse = InferResponse<typeof getApplicationQuery>;
export type Credential = DetailResponse["credentials"][number];
export type Verification = DetailResponse["verifications"][number];
export type EventRow = DetailResponse["events"][number];
export type UserLite = DetailResponse["users"][number];

export type AdvanceResponse = InferResponse<typeof advanceApplicationQuery>;
export type AdvanceBody = Omit<InferInput<typeof advanceApplicationQuery>, "id">;
export type TargetStatus = AdvanceBody["to_status"];
export type VerifyBody = Omit<InferInput<typeof verifyCredentialQuery>, "id">;
export type SubmitBody = InferInput<typeof submitApplicationQuery>;

export type ExpiringResponse = InferResponse<typeof expiringCredentialsQuery>;

// ── Token + transport ───────────────────────────────────────────────────────
const TOKEN_KEY = "credentialing.token";

export function getToken(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function send<T>(
  path: string,
  method: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(XANO_HOST + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...authHeaders(),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status}).`;
    try {
      const data = (await res.json()) as { message?: string };
      if (data && typeof data.message === "string" && data.message) {
        message = data.message;
      }
    } catch {
      // non-JSON error body; keep the default message
    }
    throw new ApiError(message, res.status);
  }
  return (await res.json()) as T;
}

// ── Endpoint wrappers ────────────────────────────────────────────────────────
export function login(body: LoginBody): Promise<LoginResponse> {
  return send<LoginResponse>(loginQuery.getPath(), loginQuery.verb, body);
}

export function me(): Promise<MeResponse> {
  return send<MeResponse>(meQuery.getPath(), meQuery.verb);
}

export function seed(): Promise<{ ok: boolean }> {
  return send<{ ok: boolean }>(seedQuery.getPath(), seedQuery.verb, {});
}

export function listApplications(): Promise<ListResponse> {
  return send<ListResponse>(
    listApplicationsQuery.getPath(),
    listApplicationsQuery.verb,
  );
}

export function getApplication(id: number): Promise<DetailResponse> {
  return send<DetailResponse>(
    getApplicationQuery.getPath({ params: { id } }),
    getApplicationQuery.verb,
  );
}

export function submitApplication(body: SubmitBody): Promise<{ application: Application }> {
  return send<{ application: Application }>(
    submitApplicationQuery.getPath(),
    submitApplicationQuery.verb,
    body,
  );
}

export function verifyCredential(id: number, body: VerifyBody): Promise<unknown> {
  return send<unknown>(
    verifyCredentialQuery.getPath({ params: { id } }),
    verifyCredentialQuery.verb,
    body,
  );
}

export function advanceApplication(
  id: number,
  body: AdvanceBody,
): Promise<AdvanceResponse> {
  return send<AdvanceResponse>(
    advanceApplicationQuery.getPath({ params: { id } }),
    advanceApplicationQuery.verb,
    body,
  );
}

export function listExpiring(): Promise<ExpiringResponse> {
  return send<ExpiringResponse>(
    expiringCredentialsQuery.getPath(),
    expiringCredentialsQuery.verb,
  );
}
