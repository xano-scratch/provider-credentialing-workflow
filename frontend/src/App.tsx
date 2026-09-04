import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  ClipboardList,
  Database,
  Loader2,
  LogOut,
  ShieldCheck,
  Stethoscope,
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
import { Input } from "@/components/ui/input";
import {
  ApiError,
  clearToken,
  getToken,
  listApplications,
  listExpiring,
  login,
  me,
  seed,
  setToken,
  type Application,
  type ExpiringResponse,
  type ListResponse,
  type MeResponse,
  type Provider,
  type TargetStatus,
} from "@/lib/api";
import {
  expiryState,
  formatDate,
  roleLabel,
  statusLabel,
  statusTone,
} from "@/lib/format";
import { ApplicationDetail } from "./ApplicationDetail.js";

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}

type Route =
  | { name: "list" }
  | { name: "expiring" }
  | { name: "detail"; id: number; tryStatus?: TargetStatus };

function parseHash(): Route {
  const h = window.location.hash.replace(/^#\/?/, "");
  if (h === "") return { name: "list" };
  if (h === "expiring") return { name: "expiring" };
  // A deep link for the demo + screenshot: open the expiry-blocked case (the
  // second seeded application) and auto-attempt approval so the governed result
  // is on screen.
  if (h === "demo") return { name: "detail", id: 2, tryStatus: "approved" };
  const m = h.match(/^app\/(\d+)$/);
  if (m) return { name: "detail", id: Number(m[1]) };
  return { name: "list" };
}

function navigate(hash: string) {
  window.location.hash = hash;
}

export default function App() {
  const [user, setUser] = useState<MeResponse | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [route, setRoute] = useState<Route>(parseHash());

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!getToken()) {
        setAuthChecked(true);
        return;
      }
      try {
        const m = await me();
        if (!cancelled) setUser(m);
      } catch {
        clearToken();
      } finally {
        if (!cancelled) setAuthChecked(true);
      }
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  const onAuthed = useCallback((m: MeResponse) => setUser(m), []);
  const onSignOut = useCallback(() => {
    clearToken();
    setUser(null);
    navigate("#/");
  }, []);

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Loading...
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onAuthed={onAuthed} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header user={user} route={route} onSignOut={onSignOut} />
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        {route.name === "list" && <ApplicationsList />}
        {route.name === "expiring" && <ExpiringView />}
        {route.name === "detail" && (
          <ApplicationDetail
            id={route.id}
            me={user}
            tryStatus={route.tryStatus}
            onBack={() => navigate("#/")}
          />
        )}
      </main>
    </div>
  );
}

function Header({
  user,
  route,
  onSignOut,
}: {
  user: MeResponse;
  route: Route;
  onSignOut: () => void;
}) {
  const [seeding, setSeeding] = useState(false);
  const reseed = async () => {
    setSeeding(true);
    try {
      await seed();
      window.location.reload();
    } catch {
      setSeeding(false);
    }
  };
  return (
    <header className="border-b border-border bg-card/40">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <Stethoscope className="size-5 text-primary" />
          <span className="font-semibold tracking-tight">Provider Credentialing</span>
        </div>
        <nav className="flex items-center gap-1">
          <Button
            variant={route.name === "list" || route.name === "detail" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => navigate("#/")}
          >
            <ClipboardList className="size-4" /> Applications
          </Button>
          <Button
            variant={route.name === "expiring" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => navigate("#/expiring")}
          >
            <CalendarClock className="size-4" /> Expiring credentials
          </Button>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={reseed} disabled={seeding}>
            {seeding ? <Loader2 className="size-4 animate-spin" /> : <Database className="size-4" />}
            Reset demo
          </Button>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{user.name}</span>
            <Badge variant="outline">{roleLabel(user.role)}</Badge>
          </div>
          <Button variant="ghost" size="icon" onClick={onSignOut} title="Sign out">
            <LogOut className="size-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}

const ROLES: { role: string; email: string; label: string; blurb: string }[] = [
  { role: "coordinator", email: "coordinator@example.com", label: "Coordinator", blurb: "Submits applications, records verifications." },
  { role: "committee", email: "committee@example.com", label: "Committee", blurb: "Advances to review, approves or denies." },
  { role: "viewer", email: "viewer@example.com", label: "Viewer", blurb: "Read-only access to every case." },
];

function LoginScreen({ onAuthed }: { onAuthed: (m: MeResponse) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seeded, setSeeded] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const doLogin = useCallback(
    async (loginEmail: string, loginPassword: string, key: string) => {
      setBusy(key);
      setError(null);
      try {
        const res = await login({ email: loginEmail, password: loginPassword });
        setToken(res.token);
        const m = await me();
        onAuthed(m);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setBusy(null);
      }
    },
    [onAuthed],
  );

  const loadDemo = useCallback(async () => {
    setBusy("seed");
    setError(null);
    try {
      await seed();
      setSeeded("Demo data loaded. Pick a role to sign in.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 p-6">
      <div className="space-y-2 text-center">
        <div className="flex items-center justify-center gap-2">
          <Stethoscope className="size-6 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">Provider Credentialing</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          A governed backend for healthcare provider credentialing. Sign in as a
          role to see which actions the API allows. Every rule is enforced at the
          endpoint, not here.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Sign in as a seeded role</CardTitle>
          <CardDescription>All seeded logins use the password <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">password123</code>.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {ROLES.map((r) => (
            <button
              key={r.role}
              type="button"
              disabled={busy !== null}
              onClick={() => doLogin(r.email, "password123", r.role)}
              className="flex w-full items-center gap-3 rounded-lg border border-border bg-background/40 p-3 text-left transition-colors hover:bg-accent disabled:opacity-60"
            >
              <ShieldCheck className="size-5 text-primary" />
              <div className="flex-1">
                <div className="font-medium">{r.label}</div>
                <div className="text-xs text-muted-foreground">{r.blurb}</div>
              </div>
              {busy === r.role ? <Loader2 className="size-4 animate-spin" /> : null}
            </button>
          ))}
        </CardContent>
      </Card>

      <div className="flex flex-col items-center gap-3">
        <Button variant="outline" onClick={loadDemo} disabled={busy !== null}>
          {busy === "seed" ? <Loader2 className="size-4 animate-spin" /> : <Database className="size-4" />}
          Load demo data
        </Button>
        {seeded ? <p className="text-sm text-emerald-400">{seeded}</p> : null}
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
      </div>

      <details className="mx-auto w-full max-w-sm text-sm text-muted-foreground">
        <summary className="cursor-pointer text-center">Sign in with an email instead</summary>
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void doLogin(email, password, "manual");
          }}
        >
          <Input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input placeholder="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button type="submit" className="w-full" disabled={busy !== null}>
            {busy === "manual" ? <Loader2 className="size-4 animate-spin" /> : null}
            Sign in
          </Button>
        </form>
      </details>
    </main>
  );
}

function ApplicationsList() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await listApplications();
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const providerById = useMemo(() => {
    const map = new Map<number, Provider>();
    for (const p of data?.providers ?? []) map.set(p.id, p);
    return map;
  }, [data]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const a of data?.applications ?? []) c[a.status] = (c[a.status] ?? 0) + 1;
    return c;
  }, [data]);

  if (loading) return <Loading label="Loading applications..." />;
  if (error) return <ErrorCard message={error} />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Applications</h1>
        <p className="text-sm text-muted-foreground">
          Every credentialing case and where it sits in the lifecycle.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {Object.entries(counts).map(([status, n]) => (
          <Badge key={status} variant={statusTone(status)}>
            {statusLabel(status)}: {n}
          </Badge>
        ))}
      </div>

      <div className="space-y-2">
        {data.applications.map((app: Application) => {
          const provider = providerById.get(app.provider_id);
          return (
            <button
              key={app.id}
              type="button"
              onClick={() => navigate(`#/app/${app.id}`)}
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-card/40 p-4 text-left transition-colors hover:bg-accent"
            >
              <div className="space-y-0.5">
                <div className="font-medium">{provider?.full_name ?? "Unknown provider"}</div>
                <div className="text-xs text-muted-foreground">
                  {provider?.specialty} · NPI {provider?.npi} · Case #{app.id}
                </div>
              </div>
              <Badge variant={statusTone(app.status)}>{statusLabel(app.status)}</Badge>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ExpiringView() {
  const [data, setData] = useState<ExpiringResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await listExpiring();
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const providerById = useMemo(() => {
    const map = new Map<number, Provider>();
    for (const p of data?.providers ?? []) map.set(p.id, p);
    return map;
  }, [data]);

  if (loading) return <Loading label="Loading credentials..." />;
  if (error) return <ErrorCard message={error} />;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Expiring credentials</h1>
        <p className="text-sm text-muted-foreground">
          Credentials expiring within 30 days or already past. An expired
          credential blocks its provider's application from being approved.
        </p>
      </div>

      {data.credentials.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No credentials are expiring soon.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {data.credentials.map((cred) => {
            const provider = providerById.get(cred.provider_id);
            const exp = expiryState(cred);
            return (
              <div
                key={cred.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/40 p-4"
              >
                <div className="flex items-center gap-3">
                  {exp.state === "expired" ? (
                    <AlertTriangle className="size-5 text-red-400" />
                  ) : (
                    <CalendarClock className="size-5 text-amber-400" />
                  )}
                  <div className="space-y-0.5">
                    <div className="font-medium">
                      {provider?.full_name ?? "Unknown provider"} · {statusLabel(cred.type)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {cred.identifier} · expires {formatDate(cred.expires_on)}
                    </div>
                  </div>
                </div>
                <Badge variant={exp.tone}>{exp.label}</Badge>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-24 text-muted-foreground">
      <Loader2 className="mr-2 size-4 animate-spin" /> {label}
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="py-10 text-center text-muted-foreground">{message}</CardContent>
    </Card>
  );
}
