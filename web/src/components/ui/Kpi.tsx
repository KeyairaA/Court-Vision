export function Kpi({ label, value, delta }: { label: string; value: string; delta?: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-sm border border-line border-t-4 border-t-rule bg-card px-4 py-4 md:px-5">
      <div className="label-caps">{label}</div>
      <div className="tabular font-display text-4xl font-extrabold leading-none text-ink md:text-[44px]">{value}</div>
      {delta ? <div className="text-sm text-ink-2">{delta}</div> : null}
    </div>
  );
}
