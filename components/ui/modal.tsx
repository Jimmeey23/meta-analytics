"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const modalStack: string[] = [];
let bodyLocks = 0;
let previousOverflow = "";

export function Modal({ open, onClose, title, subtitle, badge, children, footer, size = "lg" }: {
  open: boolean; onClose: () => void; title: React.ReactNode; subtitle?: React.ReactNode;
  badge?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const [mounted, setMounted] = React.useState(false);
  const id = React.useId();
  const dialog = React.useRef<HTMLDivElement>(null);
  const close = React.useRef(onClose);
  close.current = onClose;
  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open || !mounted) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    modalStack.push(id);
    if (bodyLocks++ === 0) { previousOverflow = document.body.style.overflow; document.body.style.overflow = "hidden"; }
    const focusable = () => Array.from(dialog.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),video[controls],[tabindex="0"]') ?? []).filter((el) => el.getClientRects().length);
    const frame = requestAnimationFrame(() => (focusable()[0] ?? dialog.current)?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1] !== id) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close.current(); }
      if (event.key === "Tab") {
        const items = focusable(), first = items[0], last = items[items.length - 1];
        if (!first) { event.preventDefault(); dialog.current?.focus(); return; }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      const index = modalStack.indexOf(id); if (index >= 0) modalStack.splice(index, 1);
      if (--bodyLocks === 0) document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open, mounted, id]);

  if (!mounted || !open) return null;
  const widths = { sm: "max-w-md", md: "max-w-2xl", lg: "max-w-4xl", xl: "max-w-6xl" };
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={subtitle ? `${id}-subtitle` : undefined} tabIndex={-1}
        className={cn("relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-surface shadow-lift animate-fade-up focus:outline-none sm:rounded-3xl", widths[size])}>
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 id={`${id}-title`} className="break-words text-[15px] font-semibold tracking-tight">{title}</h2>{badge}</div>{subtitle ? <div id={`${id}-subtitle`} className="mt-0.5 text-[11px] text-faint">{subtitle}</div> : null}</div>
          <button type="button" onClick={onClose} aria-label="Close dialog" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-faint transition hover:bg-ink/5 hover:text-ink"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        {footer ? <div className="border-t border-line px-5 py-3">{footer}</div> : null}
      </div>
    </div>, document.body,
  );
}
