import { useId, useState } from "react";
import { NavLink, useLocation } from "react-router";
import type { Manifest } from "../../data/contract";
import { Freshness } from "./Freshness";
import { NAV } from "./nav";
import { ThemeToggle } from "./ThemeToggle";
import { Wordmark } from "./Wordmark";

export function PhoneHeader({ manifest }: { manifest: Manifest | undefined }) {
  // The panel belongs to the page it was opened on, so navigating closes it.
  const { pathname } = useLocation();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const panel = useId();

  return (
    <header className="sticky top-0 z-20 bg-chrome lg:hidden">
      <div className="flex h-14 items-center justify-between pl-4 pr-2">
        <Wordmark size="sm" />
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panel}
          aria-label={open ? "Close settings" : "Open settings"}
          onClick={() => setOpenOn(open ? null : pathname)}
          className="flex size-11 items-center justify-center"
        >
          <svg width="22" height="16" aria-hidden="true" className="stroke-chrome-ink" style={{ strokeWidth: 2, strokeLinecap: "round" }}>
            {open ? (
              <>
                <line x1="4" y1="1" x2="18" y2="15" />
                <line x1="18" y1="1" x2="4" y2="15" />
              </>
            ) : (
              <>
                <line x1="1" y1="2" x2="21" y2="2" />
                <line x1="1" y1="8" x2="21" y2="8" />
                <line x1="1" y1="14" x2="21" y2="14" />
              </>
            )}
          </svg>
        </button>
      </div>
      {open ? (
        <div id={panel} className="flex flex-col gap-4 border-t border-chrome-raised px-4 py-4">
          <ThemeToggle />
          <Freshness manifest={manifest} />
        </div>
      ) : null}
      <nav aria-label="Primary" className="flex gap-[22px] overflow-x-auto border-t border-chrome-raised px-4 [scrollbar-width:none]">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex h-11 shrink-0 items-center font-display text-base font-bold uppercase tracking-[0.08em] ${
                isActive ? "text-chrome-ink shadow-[inset_0_-3px_0_var(--color-accent)]" : "text-chrome-ink-2"
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
