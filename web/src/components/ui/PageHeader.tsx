import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, sub, controls }: { eyebrow: string; title: string; sub?: ReactNode; controls?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-5">
      <div className="flex flex-col gap-2.5">
        <p className="m-0 font-display text-sm font-bold uppercase tracking-[0.14em] text-ink-2">{eyebrow}</p>
        <h1 className="m-0 font-display text-[40px] font-extrabold uppercase leading-[0.95] tracking-[0.01em] text-ink md:text-[52px]">
          {title}
        </h1>
        {sub ? <p className="m-0 text-base leading-snug text-ink-2 md:text-[17px]">{sub}</p> : null}
      </div>
      {controls}
    </div>
  );
}
