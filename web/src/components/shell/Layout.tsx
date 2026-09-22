import { Suspense } from "react";
import { Outlet } from "react-router";
import { useArtifact } from "../../data/useArtifact";
import { ErrorState, LoadingState } from "../ui/States";
import { PartialSeasonBanner } from "./PartialSeasonBanner";
import { PhoneHeader } from "./PhoneHeader";
import { Sidebar } from "./Sidebar";

export function Layout() {
  const manifest = useArtifact("manifest");
  const data = manifest.status === "ready" ? manifest.data : undefined;

  return (
    <div className="flex min-h-dvh flex-col bg-page text-ink lg:flex-row">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-card focus:px-4 focus:py-2">
        Skip to content
      </a>
      <Sidebar manifest={data} />
      <PhoneHeader manifest={data} />
      <main id="main" className="flex min-w-0 flex-1 flex-col gap-5 px-4 pb-7 pt-6 md:gap-6 md:px-10 md:pb-12 md:pt-9">
        {manifest.status === "error" ? <ErrorState error={manifest.error} retry={manifest.retry} /> : null}
        {data ? <PartialSeasonBanner manifest={data} /> : null}
        {manifest.status === "error" ? null : (
          <Suspense fallback={<LoadingState />}>
            <Outlet />
          </Suspense>
        )}
        <footer className="mt-auto flex flex-col justify-between gap-1 pt-4 text-[13px] text-ink-2 md:flex-row">
          <span>Court Vision · A portfolio project by Keyaira Austin</span>
          <span>Source: stats.nba.com via sportsdataverse</span>
        </footer>
      </main>
    </div>
  );
}
