"use client";
import * as React from "react";
import { Modal } from "@/components/ui/modal";

export type Drilldown =
  | { kind: "metric"; payload: any }
  | { kind: "entity"; payload: any }
  | { kind: "creative"; payload: any }
  | { kind: "segment"; payload: any }
  | { kind: "lead"; payload: any }
  | { kind: "event"; payload: any }
  | { kind: "time"; payload: any }
  | { kind: "discrepancy"; payload: any }
  | { kind: "insight"; payload: any };

type Ctx = {
  open: (d: Drilldown) => void;
  close: () => void;
  current: Drilldown | null;
};

const DrilldownContext = React.createContext<Ctx | null>(null);

export function useDrilldown() {
  const ctx = React.useContext(DrilldownContext);
  if (!ctx) throw new Error("useDrilldown must be used inside <DrilldownProvider>");
  return ctx;
}

export function DrilldownProvider({
  children,
  render,
}: {
  children: React.ReactNode;
  render: (d: Drilldown, close: () => void) => React.ReactNode;
}) {
  const [current, setCurrent] = React.useState<Drilldown | null>(null);
  const value = React.useMemo<Ctx>(
    () => ({ open: (d) => setCurrent(d), close: () => setCurrent(null), current }),
    [current],
  );
  return (
    <DrilldownContext.Provider value={value}>
      {children}
      {current ? render(current, value.close) : null}
    </DrilldownContext.Provider>
  );
}

/** Wraps any element so that clicking it opens a drill-down. */
export function OpenDrilldown({
  drilldown, as: Tag = "div", className, children, title,
}: {
  drilldown: Drilldown;
  as?: "div" | "button" | "span" | "tr";
  className?: string;
  children: React.ReactNode;
  title?: string;
}) {
  const { open } = useDrilldown();
  return (
    <Tag
      className={className}
      title={title}
      onClick={(e: React.MouseEvent) => {
        e.stopPropagation();
        open(drilldown);
      }}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open(drilldown);
        }
      }}
      role="button"
      aria-haspopup="dialog"
      tabIndex={0}
    >
      {children}
    </Tag>
  );
}
