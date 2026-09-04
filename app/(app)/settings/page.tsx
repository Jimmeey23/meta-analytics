import * as React from "react";
import {
  AlertTriangle, CheckCircle2, CircleSlash, Database, Facebook, Gauge, KeyRound, Link2, RefreshCw, Server, ShieldCheck, XCircle,
} from "lucide-react";
import { getSession, resolveAccounts } from "@/lib/data";
import { graphUsage, metaConfig, rateLimitCooldownMs, SCOPES } from "@/lib/meta";
import { Badge, Callout, Panel, PanelHeader } from "@/components/ui/primitives";
import { CopyButton } from "@/components/panels/copy-button";
import { relative } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  not_configured: "Meta credentials are missing. Add META_APP_ID and META_APP_SECRET to .env.local, then restart the server.",
  denied: "The connection was cancelled or a permission was declined in the Meta login dialog.",
  state: "The OAuth state check failed. Clear your cookies and try connecting again.",
  token: "Meta rejected the token exchange. Check that your app secret and redirect URI match exactly.",
};

export default async function SettingsPage({
  searchParams,
}: { searchParams: Promise<{ error?: string; message?: string; connected?: string; cleared?: string }> }) {
  const sp = await searchParams;
  const session = await getSession();
  const config = metaConfig();
  const { live, reason, accounts } = await resolveAccounts(session);
  const demo = !live;
  const usage = graphUsage();
  const cooldown = rateLimitCooldownMs();
  const quotaBars = [
    { label: "App calls", value: usage.app?.callCount ?? 0, hint: "Share of the 200/hour/user app pool" },
    { label: "App CPU time", value: usage.app?.totalCputime ?? 0, hint: "Processing time against the same pool" },
    { label: "App total time", value: usage.app?.totalTime ?? 0, hint: "Wall-clock time against the same pool" },
    { label: "Ad account calls", value: usage.businessUseCase?.callCount ?? 0, hint: "Marketing API, metered per ad account" },
    { label: "Ad account CPU", value: usage.businessUseCase?.totalCputime ?? 0, hint: "Marketing API processing time" },
    { label: "Ad account total", value: usage.businessUseCase?.totalTime ?? 0, hint: "Marketing API wall-clock time" },
  ];

  const checklist = [
    { label: "META_APP_ID", ok: Boolean(config.appId), value: config.appId ? `${config.appId.slice(0, 6)}••••••` : "missing" },
    { label: "META_APP_SECRET", ok: Boolean(config.appSecret), value: config.appSecret ? `${config.appSecret.slice(0, 4)}••••••••` : "missing" },
    { label: "META_REDIRECT_URI", ok: Boolean(config.redirectUri), value: config.redirectUri },
    { label: "Graph API version", ok: true, value: config.version },
    { label: "SESSION_SECRET", ok: (process.env.SESSION_SECRET ?? "") !== "change-me-to-a-long-random-string", value: process.env.SESSION_SECRET ? "custom" : "default (change this in production)" },
  ];

  return (
    <div className="space-y-5">
      {sp.connected ? (
        <Callout tone="pos" icon={<CheckCircle2 className="h-4 w-4" />} title="Meta account connected">
          Your ad accounts are loaded and live reporting is active.
        </Callout>
      ) : null}
      {sp.cleared ? (
        <Callout tone="info" icon={<RefreshCw className="h-4 w-4" />} title="Cache cleared">
          The next page load will fetch fresh data from the Meta Marketing API.
        </Callout>
      ) : null}
      {sp.error ? (
        <Callout tone="warn" icon={<AlertTriangle className="h-4 w-4" />} title={ERRORS[sp.error] ?? "Connection problem"}>
          {sp.message ? <span className="break-all">{decodeURIComponent(sp.message)}</span> : null}
        </Callout>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <PanelHeader
            title="Connection"
            subtitle={live ? "Connected to the Meta Marketing API" : session ? "Signed in, but serving sample data" : "Running on sample data"}
            icon={<Link2 className="h-4 w-4" />}
            right={<Badge tone={live ? "pos" : "warn"}>{live ? "Live" : session ? "Signed in · sample data" : "Demo mode"}</Badge>}
          />
          <div className="space-y-4 px-5 pb-5 pt-4">
            {session ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { label: "User", value: session.userName },
                  { label: "User ID", value: session.userId },
                  {
                    label: "Token issued", value: relative(new Date(session.issuedAt).toISOString()),
                  },
                  {
                    label: "Token expires", value: session.expiresAt ? relative(new Date(session.expiresAt).toISOString()) : "—",
                  },
                ].map((row) => (
                  <div key={row.label} className="rounded-xl border border-line/70 px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-wide text-faint">{row.label}</p>
                    <p className="truncate text-[13px] font-medium">{row.value}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-muted">
                No Meta account is connected yet. Connect one to replace the sample data with live reporting across every page.
              </p>
            )}

            {session && !live ? (
              <div className="rounded-xl border border-warn/30 bg-warn/5 px-3 py-2.5">
                <p className="text-[11px] font-semibold text-warn">Your account is connected, but no live ad account could be read</p>
                <p className="mt-1 text-[12px] text-muted">{reason ?? "Meta returned no ad accounts for this user."}</p>
                <p className="mt-1.5 text-[11px] text-faint">
                  Every page is showing sample data until this resolves. Reconnect below to refresh the token, or grant the
                  signed-in user access to an ad account in Meta Business Settings → Accounts → Ad accounts.
                </p>
              </div>
            ) : null}

            {live ? (
              <p className="text-[12px] text-muted">
                {accounts.length} live ad {accounts.length === 1 ? "account" : "accounts"} available.
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {demo ? (
                <a
                  href="/api/meta/login"
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-accent px-4 py-2.5 text-[13px] font-semibold text-white shadow-glow transition hover:opacity-90"
                >
                  <Facebook className="h-4 w-4" /> Connect Meta account
                </a>
              ) : (
                <form action="/api/meta/logout" method="post">
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 rounded-xl border border-neg/30 bg-neg/5 px-4 py-2.5 text-[13px] font-semibold text-neg transition hover:bg-neg/10"
                  >
                    <CircleSlash className="h-4 w-4" /> Disconnect
                  </button>
                </form>
              )}
              <a
                href="/api/cache"
                className="inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-[13px] font-medium transition hover:border-brand-500/40"
              >
                <RefreshCw className="h-4 w-4" /> Clear API cache
              </a>
            </div>

            <div className="rounded-xl border border-line/70 bg-ink/[0.02] p-3.5">
              <p className="mb-2 flex items-center gap-2 text-[12px] font-semibold"><KeyRound className="h-3.5 w-3.5 text-brand-500" /> Permissions requested</p>
              <div className="flex flex-wrap gap-1.5">
                {SCOPES.split(",").map((scope) => (
                  <span key={scope} className="rounded-md bg-ink/5 px-2 py-1 text-[10px] text-muted">{scope}</span>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-faint">
                Read-only scopes. MetaInsight never requests permission to modify, create or delete your campaigns.
              </p>
            </div>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Environment" subtitle="Server configuration" icon={<Server className="h-4 w-4" />} />
          <ul className="space-y-2 px-5 pb-5 pt-4">
            {checklist.map((row) => (
              <li key={row.label} className="flex items-center gap-2.5 rounded-xl border border-line/70 px-3 py-2">
                {row.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-pos" /> : <XCircle className="h-4 w-4 shrink-0 text-neg" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium">{row.label}</p>
                  <p className="truncate text-[10px] text-faint">{row.value}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="px-5 pb-5">
            <CopyButton value={config.redirectUri} label="Copy redirect URI" />
          </div>
        </Panel>

        <Panel className="lg:col-span-3">
          <PanelHeader
            title="API quota"
            subtitle="Reported by Meta on the most recent request"
            icon={<Gauge className="h-4 w-4" />}
            right={cooldown > 0 ? <Badge tone="warn">Paused {Math.ceil(cooldown / 1000)}s</Badge> : null}
          />
          <div className="px-5 pb-5 pt-4">
            {usage.at ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {quotaBars.map((bar) => (
                  <div key={bar.label} className="rounded-xl border border-line/70 px-3 py-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-[10px] uppercase tracking-wide text-faint">{bar.label}</p>
                      <p className="num text-[12px] font-semibold">{bar.value}%</p>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/10">
                      <div
                        className={cn("h-full rounded-full", bar.value >= 90 ? "bg-neg" : bar.value >= 60 ? "bg-warn" : "bg-pos")}
                        style={{ width: `${Math.min(100, bar.value)}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-[10px] text-faint">{bar.hint}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-muted">
                No request has been made yet this session. Load a report to see the current quota.
              </p>
            )}
            <p className="mt-3 text-[11px] text-faint">
              The app-level pool is 200 calls per hour for every user of the app, shared across all of them. It is charged
              for calls that use the user token and are not ads API calls — reading Pages and video creatives, for
              instance — while ads reporting is metered separately per ad account. MetaInsight caps concurrency at 4,
              batches video lookups 50 at a time and pauses for 60 seconds once Meta reports a limit.
            </p>
            {usage.regainAccessInMinutes ? (
              <p className="mt-2 text-[11px] font-medium text-warn">
                Meta estimates {usage.regainAccessInMinutes} minute
                {usage.regainAccessInMinutes === 1 ? "" : "s"} until access is restored.
              </p>
            ) : null}
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Connecting your own Meta app" subtitle="A five-minute, one-time setup" icon={<ShieldCheck className="h-4 w-4" />} />
        <ol className="space-y-3 px-5 pb-5 pt-4">
          {[
            "Go to developers.facebook.com → My Apps → Create App, choose “Business” and complete the basic setup.",
            "Add the Marketing API product, then open its settings and note the App ID and App Secret.",
            `Under Facebook Login → Settings, add this exact Valid OAuth Redirect URI: ${config.redirectUri}`,
            "Copy .env.example to .env.local in the project root and fill in META_APP_ID, META_APP_SECRET, META_REDIRECT_URI and a long random SESSION_SECRET.",
            "Restart the server, come back to this page and press Connect Meta account.",
          ].map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-500/10 text-[11px] font-semibold text-brand-500">{i + 1}</span>
              <p className="text-[12px] leading-relaxed text-muted">{step}</p>
            </li>
          ))}
        </ol>
        <div className="mx-5 mb-5 rounded-xl border border-brand-500/20 bg-brand-500/5 p-3.5">
          <p className="text-[12px] font-semibold text-brand-500">Already have a token?</p>
          <p className="mt-1 text-[11px] text-muted">
            MetaInsight exchanges your short-lived token for a long-lived token automatically. If you need extra permissions (for example `leads_retrieval`), disconnect and reconnect so Meta shows the permission dialog again.
          </p>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Data handling" subtitle="What is stored and how long" icon={<Database className="h-4 w-4" />} />
          <ul className="space-y-2 px-5 pb-5 pt-4 text-[12px] text-muted">
            <li className="flex gap-2"><span className="text-brand-500">•</span> Your access token is held in an httpOnly, signed cookie on this server. It is never sent to third parties.</li>
            <li className="flex gap-2"><span className="text-brand-500">•</span> Report responses are cached in server memory for five minutes to stay inside Meta rate limits.</li>
            <li className="flex gap-2"><span className="text-brand-500">•</span> No ad data is written to disk. Disconnecting clears the session and the cache immediately.</li>
            <li className="flex gap-2"><span className="text-brand-500">•</span> Set FORCE_DEMO=1 in .env.local to keep the app on sample data even while connected.</li>
          </ul>
        </Panel>
        <Panel>
          <PanelHeader title="Troubleshooting" subtitle="Common issues and fixes" icon={<AlertTriangle className="h-4 w-4" />} />
          <dl className="space-y-2.5 px-5 pb-5 pt-4 text-[12px]">
            {[
              ["“App Not Set Up”", "Switch the app from Development to Live mode, or add yourself as a test user under App Roles."],
              ["“Invalid redirect URI”", "The redirect URI must match exactly, including http/https and the /api/meta/callback path."],
              ["No ad accounts", "The logged-in user needs at least read access to an ad account in Business Manager."],
              ["Empty insights", "The account may have no delivery in the selected range — widen the date range."],
              ["Missing leads", "Grant pages_show_list, pages_read_engagement and leads_retrieval, then reconnect."],
            ].map(([term, fix]) => (
              <div key={term} className="rounded-xl border border-line/70 px-3 py-2">
                <dt className="text-[12px] font-medium text-ink">{term}</dt>
                <dd className="mt-0.5 text-[11px]">{fix}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>
    </div>
  );
}
