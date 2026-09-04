import * as React from "react";
import { AppShell } from "@/components/shell/app-shell";
import { DrilldownHost } from "@/components/panels/drilldown-views";
import { getSession, isDemo, listAccounts } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const accounts = await listAccounts(session);
  return (
    <AppShell
      accounts={accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
      mode={isDemo(session) ? "demo" : "live"}
      userName={session?.userName ?? ""}
      userPicture={session?.picture}
    >
      <DrilldownHost>{children}</DrilldownHost>
    </AppShell>
  );
}
