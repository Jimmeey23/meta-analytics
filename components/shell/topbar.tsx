"use client";
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Calendar, ChevronDown, Download, Facebook, Loader2, Menu, RefreshCw, Search } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { cn } from "@/lib/utils";
import { RANGE_PRESETS } from "@/lib/ranges";

type AccountLite = { id: string; name: string; currency: string };

const TITLES: Record<string, string> = {
  "/dashboard": "Account overview",
  "/campaigns": "Campaign performance",
  "/audience": "Audience & placements",
  "/leads": "Leads & lead forms",
  "/pixel": "Pixel & events",
  "/insights": "Insights & suggestions",
  "/settings": "Settings",

  "/analytics": "Advanced analytics",};

export function Topbar({
  accounts, mode, onMenu, generatedAt,
}: { accounts: AccountLite[]; mode: "live" | "demo"; onMenu?: () => void; generatedAt?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = React.useState<null | "range" | "account">(null);
  const [pending, startTransition] = React.useTransition();

  const rangeKey = params.get("range") ?? "last_30d";
  const accountId = params.get("account") ?? accounts[0]?.id;
  const account = accounts.find((a) => a.id === accountId) ?? accounts[0];
  const preset = RANGE_PRESETS.find((r) => r.key === rangeKey);

  const setParam = React.useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (value === null) next.delete(key);
      else next.set(key, value);
      startTransition(() => router.push(`${pathname}?${next.toString()}`));
      setOpen(null);
    },
    [params, pathname, router],
  );

  const label = preset
    ? preset.label
    : params.get("since") && params.get("until")
      ? `${params.get("since")} → ${params.get("until")}`
      : "Last 30 days";

  React.useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest("[data-popover]")) setOpen(null);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-xl print:hidden">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <button onClick={onMenu} className="grid h-9 w-9 place-items-center rounded-lg border border-line text-muted hover:text-ink lg:hidden">
          <Menu className="h-4 w-4" />
        </button>

        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-semibold tracking-tight">{TITLES[pathname] ?? "MetaInsight"}</h1>
          <p className="truncate text-[11px] text-faint">
            {generatedAt ? `Updated ${new Date(generatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : mode === "live" ? "Live data" : "Sample data"}
            {account ? ` · ${account.name}` : ""}
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Account switcher */}
          <div className="relative" data-popover>
            <button
              onClick={() => setOpen(open === "account" ? null : "account")}
              className="flex max-w-[220px] items-center gap-2 rounded-xl border border-line bg-surface/60 px-3 py-2 text-xs font-medium transition hover:border-brand-500/40"
            >
              <span className="truncate">{account?.name ?? "Select account"}</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-faint" />
            </button>
            {open === "account" ? (
              <div className="absolute right-0 z-40 mt-2 w-72 overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-lift">
                {accounts.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setParam("account", a.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs transition hover:bg-ink/5",
                      a.id === account?.id ? "bg-brand-500/10 text-brand-500" : "",
                    )}
                  >
                    <span className="truncate flex-1">{a.name}</span>
                    <span className="num shrink-0 text-[10px] text-faint">{a.currency}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {/* Date range */}
          <div className="relative" data-popover>
            <button
              onClick={() => setOpen(open === "range" ? null : "range")}
              className="flex items-center gap-2 rounded-xl border border-line bg-surface/60 px-3 py-2 text-xs font-medium transition hover:border-brand-500/40"
            >
              <Calendar className="h-3.5 w-3.5 text-faint" />
              <span className="whitespace-nowrap">{label}</span>
              <ChevronDown className="h-3.5 w-3.5 text-faint" />
            </button>
            {open === "range" ? (
              <div className="absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-2xl border border-line bg-surface p-1.5 shadow-lift">
                {RANGE_PRESETS.map((r) => (
                  <button
                    key={r.key}
                    onClick={() => {
                      const next = new URLSearchParams(params.toString());
                      next.set("range", r.key);
                      next.delete("since");
                      next.delete("until");
                      startTransition(() => router.push(`${pathname}?${next.toString()}`));
                      setOpen(null);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition hover:bg-ink/5",
                      r.key === rangeKey ? "bg-brand-500/10 text-brand-500" : "",
                    )}
                  >
                    <span>{r.label}</span>
                    <span className="num text-[10px] text-faint">{r.days}d</span>
                  </button>
                ))}
                <div className="mt-1.5 border-t border-line pt-2">
                  <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-faint">Custom range</p>
                  <form
                    className="flex items-center gap-1.5 px-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const fd = new FormData(e.currentTarget);
                      const since = String(fd.get("since") ?? "");
                      const until = String(fd.get("until") ?? "");
                      if (!since || !until) return;
                      const next = new URLSearchParams(params.toString());
                      next.delete("range");
                      next.set("since", since);
                      next.set("until", until);
                      startTransition(() => router.push(`${pathname}?${next.toString()}`));
                      setOpen(null);
                    }}
                  >
                    <input type="date" name="since" className="w-full rounded-lg border border-line bg-bg px-2 py-1.5 text-[11px] outline-none focus:border-brand-500" />
                    <span className="text-faint">→</span>
                    <input type="date" name="until" className="w-full rounded-lg border border-line bg-bg px-2 py-1.5 text-[11px] outline-none focus:border-brand-500" />
                    <button type="submit" className="rounded-lg bg-brand-500 px-2 py-1.5 text-[11px] font-semibold text-white">Go</button>
                  </form>
                </div>
              </div>
            ) : null}
          </div>

          <a
            href={`/api/export?${new URLSearchParams({
              range: rangeKey,
              ...(params.get("since") ? { since: params.get("since")! } : {}),
              ...(params.get("until") ? { until: params.get("until")! } : {}),
              ...(accountId ? { account: accountId } : {}),
            }).toString()}`}
            className="flex items-center gap-1.5 rounded-xl border border-line bg-surface/60 px-3 py-2 text-xs font-medium transition hover:border-brand-500/40"
            title="Export the current report as CSV"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Export</span>
          </a>

          <button
            onClick={() => startTransition(() => router.refresh())}
            className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-surface/60 text-muted transition hover:border-brand-500/40 hover:text-ink"
            title="Refresh data"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>

          <ThemeToggle />

          {mode === "demo" ? (
            <a
              href="/api/meta/login"
              className="hidden items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-500 to-accent px-3 py-2 text-xs font-semibold text-white shadow-glow transition hover:opacity-90 sm:flex"
            >
              <Facebook className="h-3.5 w-3.5" /> Connect Meta
            </a>
          ) : null}
        </div>
      </div>
    </header>
  );
}
