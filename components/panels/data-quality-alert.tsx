import { AlertTriangle } from "lucide-react";

function stepsFor(warning: string) {
  const value = warning.toLowerCase();
  if (value.includes("rate limit") || value.includes("request limit") || value.includes("requests are paused"))
    return ["Wait for the cooldown to pass — MetaInsight pauses Graph requests for 60s after Meta reports a limit, then resumes automatically.", "Narrow the date range or pick a single ad account so each refresh reads less.", "If it recurs hourly, raise the app's rate limit tier in developers.facebook.com → App Review, or spread refreshes further apart."];
  if (value.includes("access token") || value.includes("session has expired") || value.includes("code 190"))
    return ["Open Settings and choose Reconnect Meta account — the saved token is no longer valid.", "Approve the permission dialog again so a fresh long-lived token is issued.", "If it fails immediately, confirm META_APP_ID, META_APP_SECRET and META_REDIRECT_URI match the app in developers.facebook.com."];
  if (value.startsWith("meta account:"))
    return ["Open Settings to see the exact response Meta returned for this user.", "In Meta Business Settings → Accounts → Ad accounts, confirm the signed-in user has access to at least one ad account.", "Reconnect MetaInsight so the new asset permissions are picked up."];
  if (value.startsWith("pages:") || value.startsWith("lead forms")) return ["Open Meta Business Settings → Integrations → Leads Access.", "Select the affected Page and assign the signed-in user or system user.", "Reconnect MetaInsight so the new Page permissions are included."];
  if (value.startsWith("ad metadata:")) return ["Reduce the selected date range to 7 or 30 days.", "Confirm the user has ads_read access to the selected ad account.", "Retry after Meta rate limits recover; performance data remains available while creative metadata is unavailable."];
  if (value.startsWith("pixel") || value.includes("event")) return ["Open Events Manager and select the pixel shown in MetaInsight.", "Use Test Events to reproduce the affected event.", "Correct the parameter named in Meta’s error, publish the integration, and retest."];
  return ["Confirm the selected account and date range in the top bar.", "Refresh once after Meta finishes processing recent data.", "If it persists, verify the signed-in user’s asset permissions in Meta Business Settings."];
}

export function DataQualityAlert({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return <section className="rounded-2xl border border-warn/30 bg-warn/5 p-4" aria-labelledby="data-quality-title">
    <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" /><div className="min-w-0 flex-1"><h2 id="data-quality-title" className="text-sm font-semibold">Data discrepancies found</h2><p className="mt-1 text-xs text-muted">Each issue below identifies the failing dataset, Meta’s exact response, and the recovery path.</p></div></div>
    <div className="mt-3 grid gap-2 lg:grid-cols-2">{warnings.slice(0, 6).map((warning) => {
      const split = warning.indexOf(":");
      const source = split > 0 ? warning.slice(0, split) : "Meta API";
      const message = split > 0 ? warning.slice(split + 1).trim() : warning;
      return <details key={warning} className="rounded-xl border border-line/70 bg-surface/70 px-3 py-2"><summary className="cursor-pointer text-xs font-semibold">{source}: <span className="font-normal text-muted">{message}</span></summary><ol className="mt-2 space-y-1.5 text-[11px] text-muted">{stepsFor(warning).map((step, index) => <li key={step} className="flex gap-2"><span className="num font-semibold text-warn">{index + 1}.</span><span>{step}</span></li>)}</ol></details>;
    })}</div>
  </section>;
}
