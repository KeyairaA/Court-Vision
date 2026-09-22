import { NavLink } from "react-router";
import type { Manifest } from "../../data/contract";
import { Freshness } from "./Freshness";
import { NAV } from "./nav";
import { ThemeToggle } from "./ThemeToggle";
import { Wordmark } from "./Wordmark";

export function Sidebar({ manifest }: { manifest: Manifest | undefined }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col gap-8 border-r border-chrome-raised bg-chrome px-4 pb-6 pt-7 lg:flex">
      <div className="px-3.5">
        <Wordmark />
      </div>
      <nav aria-label="Primary" className="flex flex-col gap-1">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex h-11 items-center gap-3 rounded px-3.5 font-display text-[17px] font-bold uppercase tracking-[0.08em] ${
                isActive ? "bg-chrome-raised text-chrome-ink" : "text-chrome-ink-2 hover:text-chrome-ink"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span aria-hidden="true" className={`inline-block size-2 shrink-0 ${isActive ? "bg-accent" : ""}`} />
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-4 px-3.5">
        <ThemeToggle />
        <Freshness manifest={manifest} />
      </div>
    </aside>
  );
}
