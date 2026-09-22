import { useId, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import type { CareerRecord } from "../../data/contract";
import { searchPlayers } from "../../lib/players";

/**
 * Player finder, built on the ARIA 1.2 combobox pattern: type to filter,
 * arrow keys to move, Enter to open, Escape to close.
 */
export function PlayerSearch({ careers, label = "Find a player", className = "", onPick }: {
  careers: CareerRecord[];
  label?: string;
  className?: string;
  /** Defaults to opening the player's profile. */
  onPick?: (player: CareerRecord) => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const results = useMemo(() => searchPlayers(careers, query), [careers, query]);
  const expanded = open && query.trim().length > 0;

  const pick = (p: CareerRecord) => {
    setQuery("");
    setOpen(false);
    if (onPick) onPick(p);
    else navigate(`/players/${p.player_id}`);
  };

  return (
    <div className={`relative ${className}`}>
      <label className="label-caps flex flex-col gap-1.5">
        {label}
        <input
          type="search"
          role="combobox"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={expanded && results[active] ? `${listId}-${results[active]!.player_id}` : undefined}
          autoComplete="off"
          placeholder="Type a name"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && results[active]) {
              e.preventDefault();
              pick(results[active]!);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          className="h-11 w-full rounded border border-field-line bg-field px-3 font-sans text-[15px] font-medium normal-case tracking-normal text-ink placeholder:text-muted md:h-10"
        />
      </label>
      {expanded ? (
        // The ARIA 1.2 combobox pattern: a listbox of options owned by the input.
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-to-interactive-role
        <ul id={listId} role="listbox" aria-label="Matching players" className="absolute left-0 right-0 top-full z-30 m-0 mt-1 max-h-80 list-none overflow-auto rounded border border-line bg-card p-1 shadow-[0_8px_24px_rgba(0,0,0,0.16)]">
          {results.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-ink-2">No player by that name in 2017 to 2026.</li>
          ) : (
            results.map((p, i) => (
              <li
                key={p.player_id}
                id={`${listId}-${p.player_id}`}
                // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-to-interactive-role
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(p);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-baseline justify-between gap-3 rounded-[3px] px-3 py-2.5 ${i === active ? "bg-highlight" : ""}`}
              >
                <span className="font-semibold text-ink">{p.player_name}</span>
                <span className="tabular shrink-0 text-[13px] text-ink-2">
                  {p.first_season === p.last_season ? p.first_season : `${p.first_season} to ${p.last_season}`}
                </span>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
