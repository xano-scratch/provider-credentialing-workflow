// Display helpers: turn the backend's enum values and epochms timestamps into
// readable labels and badge tones. The expiry classification mirrors the
// server rule (within 30 days = expiring, past = expired) so the UI and the
// governed endpoints tell the same story.

type BadgeTone =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "warning"
  | "info"
  | "muted";

const DAY_MS = 24 * 60 * 60 * 1000;

const LABELS: Record<string, string> = {
  // application statuses
  submitted: "Submitted",
  primary_source_verification: "Primary-source verification",
  committee_review: "Committee review",
  approved: "Approved",
  denied: "Denied",
  re_credential: "Re-credentialing",
  // credential types
  state_license: "State license",
  dea: "DEA registration",
  board_certification: "Board certification",
  malpractice_insurance: "Malpractice insurance",
  // roles
  coordinator: "Coordinator",
  committee: "Committee",
  viewer: "Viewer",
};

export function statusLabel(value: string): string {
  return LABELS[value] ?? value;
}

export function roleLabel(value: string | null | undefined): string {
  if (!value) return "Unknown";
  return LABELS[value] ?? value;
}

export function statusTone(status: string): BadgeTone {
  switch (status) {
    case "approved":
      return "success";
    case "denied":
      return "destructive";
    case "committee_review":
      return "warning";
    case "primary_source_verification":
    case "re_credential":
      return "info";
    default:
      return "secondary";
  }
}

export function actionLabel(action: string): string {
  if (action.startsWith("advanced:")) {
    return `Advanced to ${statusLabel(action.slice("advanced:".length))}`;
  }
  switch (action) {
    case "submitted":
      return "Submitted";
    case "verification_recorded":
      return "Verification recorded";
    case "approved":
      return "Approved";
    case "denied":
      return "Denied";
    case "transition_blocked":
      return "Transition blocked";
    default:
      return statusLabel(action);
  }
}

export function actionTone(action: string): BadgeTone {
  if (action === "transition_blocked" || action === "denied") return "destructive";
  if (action === "approved") return "success";
  if (action === "verification_recorded") return "info";
  if (action.startsWith("advanced:")) return "info";
  return "muted";
}

export type ExpiryState = {
  state: "valid" | "expiring" | "expired" | "revoked";
  label: string;
  tone: BadgeTone;
};

export function expiryState(cred: {
  expires_on: number;
  status: string;
}): ExpiryState {
  if (cred.status === "revoked") {
    return { state: "revoked", label: "Revoked", tone: "destructive" };
  }
  const now = Date.now();
  if (cred.expires_on < now) {
    return { state: "expired", label: "Expired", tone: "destructive" };
  }
  if (cred.expires_on < now + 30 * DAY_MS) {
    const days = Math.max(1, Math.round((cred.expires_on - now) / DAY_MS));
    return {
      state: "expiring",
      label: `Expires in ${days} day${days === 1 ? "" : "s"}`,
      tone: "warning",
    };
  }
  return { state: "valid", label: "Current", tone: "success" };
}

export function formatDate(epochms: number | null | undefined): string {
  if (!epochms) return "—";
  return new Date(epochms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(epochms: number | null | undefined): string {
  if (!epochms) return "—";
  return new Date(epochms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
