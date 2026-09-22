import { NA } from "../../lib/format";

export function Badge({ children, title }: { children: string; title?: string }) {
  return (
    <span title={title} className="inline-block rounded-[3px] bg-notice px-2 py-0.5 font-display text-[13px] font-bold uppercase tracking-[0.06em] text-notice-ink">
      {children}
    </span>
  );
}

/** Renders a formatted value, muting the NA placeholder so it never reads as data. */
export function Value({ text }: { text: string }) {
  return text === NA ? <span className="text-muted">{NA}</span> : <>{text}</>;
}
