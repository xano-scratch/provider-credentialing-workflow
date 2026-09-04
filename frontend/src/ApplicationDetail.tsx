import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Stamp,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  advanceApplication,
  ApiError,
  getApplication,
  verifyCredential,
  type Credential,
  type DetailResponse,
  type MeResponse,
  type TargetStatus,
} from "@/lib/api";
import {
  actionLabel,
  actionTone,
  expiryState,
  formatDate,
  formatDateTime,
  statusLabel,
  statusTone,
} from "@/lib/format";

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}

// The recorded primary source per credential type (recorded, not called live).
const SOURCE_BY_TYPE: Record<string, string> = {
  state_license: "State Medical Board",
  dea: "DEA Registry",
  board_certification: "ABMS",
  malpractice_insurance: "Insurer Certificate",
};

type Banner = { tone: "success" | "destructive" | "info"; text: string };

export function ApplicationDetail({
  id,
  me,
  tryStatus,
  onBack,
}: {
  id: number;
  me: MeResponse;
  tryStatus?: TargetStatus | null;
  onBack: () => void;
}) {
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const triedRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await getApplication(id);
      setData(res);
      setLoadError(null);
    } catch (err) {
      setLoadError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    triedRef.current = false;
    setBanner(null);
    void load();
  }, [load]);

  const doAdvance = useCallback(
    async (to: TargetStatus, label: string) => {
      setBusy(label);
      try {
        const res = await advanceApplication(id, { to_status: to });
        if (res.ok === true) {
          setBanner({
            tone: "success",
            text: `Moved to ${statusLabel(String(res.to_status))}.`,
          });
        } else {
          setBanner({
            tone: "destructive",
            text: String(res.reason || "Transition blocked."),
          });
        }
        await load();
      } catch (err) {
        setBanner({ tone: "destructive", text: errorMessage(err) });
      } finally {
        setBusy(null);
      }
    },
    [id, load],
  );

  const doVerify = useCallback(
    async (cred: Credential) => {
      const label = `verify-${cred.id}`;
      setBusy(label);
      try {
        await verifyCredential(id, {
          credential_id: cred.id,
          source: SOURCE_BY_TYPE[cred.type] ?? "Primary source",
          verified: true,
        });
        setBanner({
          tone: "success",
          text: `Recorded a primary-source verification for ${statusLabel(cred.type)}.`,
        });
        await load();
      } catch (err) {
        setBanner({ tone: "destructive", text: errorMessage(err) });
      } finally {
        setBusy(null);
      }
    },
    [id, load],
  );

  // Auto-attempt (deep-link "#/demo") so a screenshot or a shared link lands on
  // the governed result with the rule that fired. A blocked move changes no
  // state, so this only reads.
  useEffect(() => {
    if (!data || triedRef.current || !tryStatus) return;
    triedRef.current = true;
    void doAdvance(tryStatus, `try-${tryStatus}`);
  }, [data, tryStatus, doAdvance]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Loading case...
      </div>
    );
  }

  if (loadError || !data || !data.application) {
    return (
      <div className="space-y-4">
        <BackButton onBack={onBack} />
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {loadError ?? "Application not found."}
          </CardContent>
        </Card>
      </div>
    );
  }

  const app = data.application;
  const provider = data.provider;
  const userName = (userId: number | null | undefined) =>
    data.users.find((u) => u.id === userId)?.name ?? "Unknown";

  const verificationByCred = new Map(
    data.verifications.map((v) => [v.credential_id, v]),
  );
  const activeCreds = data.credentials.filter((c) => c.status === "active");
  const hasExpired = data.credentials.some(
    (c) => expiryState(c).state === "expired",
  );
  const allActiveVerified =
    activeCreds.length > 0 &&
    activeCreds.every((c) => verificationByCred.get(c.id)?.verified === true);

  const actions = buildActions({
    role: me.role ?? "",
    status: app.status,
    activeCreds,
    verificationByCred,
    busy,
    doAdvance,
    doVerify,
  });

  return (
    <div className="space-y-6">
      <BackButton onBack={onBack} />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-2xl">
                {provider?.full_name ?? "Unknown provider"}
              </CardTitle>
              <CardDescription>
                {provider?.specialty} · NPI {provider?.npi} · Case #{app.id}
              </CardDescription>
            </div>
            <Badge variant={statusTone(app.status)} className="text-sm">
              {statusLabel(app.status)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <div>
            Submitted by {userName(app.submitted_by)} on {formatDate(app.created_at)}
          </div>
          {app.decided_by ? (
            <div>
              Decided by {userName(app.decided_by)}
              {app.decision_note ? `: ${app.decision_note}` : ""}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Governance notices, computed from the same signals the rules read. */}
      {app.status === "committee_review" && hasExpired ? (
        <Notice
          tone="warning"
          icon={<ShieldAlert className="size-4" />}
          text="Approval is blocked while this provider has an expired credential. Renew or revoke it first."
        />
      ) : null}
      {app.status === "primary_source_verification" && !allActiveVerified ? (
        <Notice
          tone="info"
          icon={<ShieldCheck className="size-4" />}
          text="Committee review is gated until every active credential has a verified primary-source record."
        />
      ) : null}

      {banner ? <Notice tone={banner.tone} text={banner.text} /> : null}

      {actions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <Button
              key={a.key}
              variant={a.variant}
              disabled={busy !== null}
              onClick={a.onClick}
            >
              {busy === a.key ? <Loader2 className="size-4 animate-spin" /> : a.icon}
              {a.label}
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Your role ({roleName(me.role)}) has read-only access to this case.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Credentials</CardTitle>
            <CardDescription>
              Verification status and expiry drive the gates on this case.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.credentials.map((cred) => {
              const exp = expiryState(cred);
              const v = verificationByCred.get(cred.id);
              return (
                <div key={cred.id} className="rounded-lg border border-border bg-background/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{statusLabel(cred.type)}</span>
                    <Badge variant={exp.tone}>{exp.label}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {cred.identifier} · expires {formatDate(cred.expires_on)}
                  </div>
                  <div className="mt-2">
                    {v?.verified ? (
                      <Badge variant="success">
                        <CheckCircle2 /> Verified · {v.source}
                      </Badge>
                    ) : cred.status === "active" ? (
                      <Badge variant="muted">Not verified</Badge>
                    ) : (
                      <Badge variant="muted">Not required</Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Audit trail</CardTitle>
            <CardDescription>Every move and every blocked move, in order.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="relative space-y-4 border-l border-border pl-5">
              {data.events.map((ev) => (
                <li key={ev.id} className="relative">
                  <span className="absolute -left-[1.4rem] top-1 flex size-3 items-center justify-center rounded-full bg-border" />
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={actionTone(ev.action)}>{actionLabel(ev.action)}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {userName(ev.actor_id)} · {formatDateTime(ev.created_at)}
                    </span>
                  </div>
                  {ev.detail ? (
                    <p className="mt-1 text-sm text-muted-foreground">{ev.detail}</p>
                  ) : null}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function roleName(role: string | null | undefined): string {
  return statusLabel(role ?? "");
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
      <ArrowLeft className="size-4" /> All applications
    </Button>
  );
}

type ActionButton = {
  key: string;
  label: string;
  variant: "default" | "outline" | "destructive" | "secondary";
  icon: ReactNode;
  onClick: () => void;
};

function buildActions(args: {
  role: string;
  status: string;
  activeCreds: Credential[];
  verificationByCred: Map<number, { verified: boolean }>;
  busy: string | null;
  doAdvance: (to: TargetStatus, label: string) => void;
  doVerify: (cred: Credential) => void;
}): ActionButton[] {
  const { role, status, activeCreds, verificationByCred, doAdvance, doVerify } = args;
  const actions: ActionButton[] = [];

  if (role === "coordinator") {
    if (status === "submitted") {
      actions.push({
        key: "adv-psv",
        label: "Start primary-source verification",
        variant: "default",
        icon: <Stamp className="size-4" />,
        onClick: () => doAdvance("primary_source_verification", "adv-psv"),
      });
    }
    if (status === "primary_source_verification") {
      for (const cred of activeCreds) {
        if (verificationByCred.get(cred.id)?.verified) continue;
        actions.push({
          key: `verify-${cred.id}`,
          label: `Verify ${statusLabel(cred.type)}`,
          variant: "outline",
          icon: <CheckCircle2 className="size-4" />,
          onClick: () => doVerify(cred),
        });
      }
    }
    if (status === "approved") {
      actions.push({
        key: "adv-recred",
        label: "Start re-credentialing",
        variant: "outline",
        icon: <Stamp className="size-4" />,
        onClick: () => doAdvance("re_credential", "adv-recred"),
      });
    }
    if (status === "re_credential") {
      actions.push({
        key: "adv-psv2",
        label: "Start primary-source verification",
        variant: "default",
        icon: <Stamp className="size-4" />,
        onClick: () => doAdvance("primary_source_verification", "adv-psv2"),
      });
    }
  }

  if (role === "committee") {
    if (status === "primary_source_verification") {
      actions.push({
        key: "adv-committee",
        label: "Advance to committee review",
        variant: "default",
        icon: <Stamp className="size-4" />,
        onClick: () => doAdvance("committee_review", "adv-committee"),
      });
    }
    if (status === "committee_review") {
      actions.push({
        key: "adv-approved",
        label: "Approve",
        variant: "default",
        icon: <CheckCircle2 className="size-4" />,
        onClick: () => doAdvance("approved", "adv-approved"),
      });
      actions.push({
        key: "adv-denied",
        label: "Deny",
        variant: "destructive",
        icon: <XCircle className="size-4" />,
        onClick: () => doAdvance("denied", "adv-denied"),
      });
    }
  }

  return actions;
}

function Notice({
  tone,
  text,
  icon,
}: {
  tone: "success" | "destructive" | "info" | "warning";
  text: string;
  icon?: ReactNode;
}) {
  const styles: Record<string, string> = {
    success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    destructive: "border-red-500/30 bg-red-500/10 text-red-200",
    info: "border-sky-500/30 bg-sky-500/10 text-sky-200",
    warning: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  };
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${styles[tone]}`}>
      {icon ?? <Clock className="mt-0.5 size-4 shrink-0" />}
      <span>{text}</span>
    </div>
  );
}
