"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Activity, BarChart3, ChevronRight, Facebook, LayoutDashboard, Megaphone, Settings,
  Sparkles, Target, UserPlus, X, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, hint: "KPIs, trends & account health" },
  { href: "/analytics", label: "Analytics", icon: BarChart3, hint: "Advanced metrics & studio breakdown" },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone, hint: "Campaigns, ad sets & ads" },
  { href: "/audience", label: "Audience", icon: Target, hint: "Demographics, placements, timing" },
  { href: "/leads", label: "Leads", icon: UserPlus, hint: "Lead forms & captured leads" },
  { href: "/pixel", label: "Pixel & Events", icon: Activity, hint: "Configuration, events, diagnostics" },
  { href: "/insights", label: "Insights", icon: Sparkles, hint: "Recommendations & actions" },
  { href: "/settings", label: "Settings", icon: Settings, hint: "Connection, API & data" },
];

export function Sidebar({
  mode, userName, userPicture, onClose,
}: { mode: "live" | "demo"; userName: string; userPicture?: string; onClose?: () => void }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const query = params.toString();
  return (
    <div className="flex h-full w-[268px] flex-col border-r border-line bg-surface/50 backdrop-blur-xl">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="relative grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 via-accent to-accent-2 text-white shadow-glow">
          <Zap className="h-4 w-4" strokeWidth={2.5} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold tracking-tight">MetaInsight</p>
          <p className="truncate text-[11px] text-faint">Ads intelligence suite</p>
        </div>
        {onClose ? (
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-faint hover:bg-ink/5 hover:text-ink lg:hidden">
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={{ pathname: item.href, search: query }}
              prefetch={true}
              onClick={onClose}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all",
                active ? "text-ink" : "text-muted hover:bg-ink/[0.04] hover:text-ink",
              )}
            >
              {active ? (
                <span className="absolute inset-0 rounded-xl border border-brand-500/25 bg-gradient-to-r from-brand-500/15 to-accent/10" />
              ) : null}
              <item.icon className={cn("relative h-4 w-4 shrink-0", active ? "text-brand-500" : "text-faint group-hover:text-muted")} />
              <span className="relative flex-1 truncate font-medium">{item.label}</span>
              {active ? <ChevronRight className="relative h-3.5 w-3.5 text-brand-500/70" /> : null}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-3 p-3">
        <div className="rounded-2xl border border-line bg-elevated/60 p-3.5">
          <div className="flex items-center gap-2">
            <span className={cn("relative flex h-2 w-2")}>
              <span className={cn("absolute inline-flex h-2 w-2 rounded-full opacity-75", mode === "live" ? "animate-ping bg-pos" : "bg-warn")} />
              <span className={cn("relative inline-flex h-2 w-2 rounded-full", mode === "live" ? "bg-pos" : "bg-warn")} />
            </span>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">
              {mode === "live" ? "Live connection" : "Demo data"}
            </p>
          </div>
          <p className="mt-1.5 text-xs text-muted">
            {mode === "live" ? "Streaming from the Meta Marketing API." : "Explore the full product with sample data."}
          </p>
          {mode === "demo" ? (
            <a
              href="/api/meta/login"
              className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-brand-500 to-accent px-3 py-2 text-xs font-semibold text-white shadow-glow transition hover:opacity-90"
            >
              <Facebook className="h-3.5 w-3.5" /> Connect Meta
            </a>
          ) : (
            <div className="mt-2.5 flex items-center gap-2">
              {userPicture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={userPicture} alt="" className="h-6 w-6 rounded-full" />
              ) : (
                <div className="grid h-6 w-6 place-items-center rounded-full bg-brand-500/15 text-[10px] font-bold text-brand-500">
                  {(userName || "U").slice(0, 1).toUpperCase()}
                </div>
              )}
              <p className="truncate text-xs font-medium">{userName}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
