import type { ReactNode } from "react";

export function Select<T extends string | number>({ label, value, options, onChange, className = "" }: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <label className={`label-caps flex flex-col gap-1.5 ${className}`}>
      {label}
      <select
        value={String(value)}
        onChange={(e) => {
          const hit = options.find((o) => String(o.value) === e.target.value);
          if (hit) onChange(hit.value);
        }}
        className="h-11 rounded border border-field-line bg-field px-2.5 font-sans text-[15px] font-medium normal-case tracking-normal text-ink md:h-10"
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Checkbox({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex h-11 cursor-pointer items-center gap-2 text-[15px] text-ink md:h-10">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-[18px] accent-accent" />
      {children}
    </label>
  );
}
