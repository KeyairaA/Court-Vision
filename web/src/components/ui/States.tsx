import type { ArtifactError } from "../../data/load";

const MESSAGES: Record<ArtifactError["kind"], string> = {
  network: "The data could not be reached.",
  http: "The data file is missing on the server.",
  parse: "The data file could not be read.",
  schema: "The data is in a newer format than this page understands.",
};

export function ErrorState({ error, retry }: { error: ArtifactError; retry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded border border-line border-t-4 border-t-accent bg-card p-6">
      <h2 className="m-0 font-display text-2xl font-extrabold uppercase text-ink">{MESSAGES[error.kind]}</h2>
      <p className="m-0 max-w-prose text-[15px] leading-relaxed text-ink-2">{error.message}</p>
      {retry && error.kind !== "schema" ? (
        <button
          type="button"
          onClick={retry}
          className="h-11 rounded bg-ink px-5 font-display text-base font-bold uppercase tracking-[0.06em] text-card"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

/** Placeholder blocks shaped like the page, so the layout does not jump when data arrives. */
export function LoadingState({ blocks = [120, 360, 220] }: { blocks?: number[] }) {
  return (
    <div aria-busy="true" aria-live="polite" className="flex flex-col gap-4">
      <span className="sr-only">Loading data</span>
      {blocks.map((h, i) => (
        <div key={i} style={{ height: h }} className="animate-pulse rounded border border-line bg-card" />
      ))}
    </div>
  );
}
