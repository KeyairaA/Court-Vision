import type { ReactNode } from "react";

export function Card({ children, className = "", as: Tag = "section", ...rest }: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "figure";
  "aria-labelledby"?: string;
}) {
  return (
    <Tag className={`flex min-w-0 flex-col gap-4 rounded border border-line bg-card p-4 md:px-6 md:py-5 ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

export function CardHead({ id, title, sub, right }: { id?: string; title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h2 id={id} className="m-0 font-display text-[22px] font-bold uppercase leading-tight tracking-[0.04em] text-ink">
          {title}
        </h2>
        {sub ? <p className="m-0 text-sm leading-snug text-ink-2">{sub}</p> : null}
      </div>
      {right}
    </div>
  );
}
