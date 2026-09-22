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

export function Segmented<T extends string>({ label, value, options, onChange, disabled = false, note }: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
  /** Why the control is disabled, read by screen readers and shown on hover. */
  note?: string;
}) {
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0" disabled={disabled} title={disabled ? note : undefined}>
      <legend className="label-caps mb-1.5 p-0">{label}</legend>
      <div className={`flex gap-0.5 rounded border border-field-line bg-field p-px ${disabled ? "opacity-50" : ""}`}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
            className={`h-[42px] flex-1 whitespace-nowrap rounded-[3px] px-3.5 font-display text-[15px] font-bold uppercase tracking-[0.06em] md:h-[36px] ${
              o.value === value ? "bg-ink text-card" : "text-ink-2 hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {disabled && note ? <span className="sr-only">{note}</span> : null}
    </fieldset>
  );
}
