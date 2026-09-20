"""
Court Vision spike 04: does the provider reuse TEAM_IDs for revived franchises?

THE QUESTION
------------
Toronto and Portland both debuted in the 2026 season, but the provider gave them
very different identifiers:

    Toronto Tempo   1611661332   a fresh number, above the previous maximum
    Portland Fire   1611661327   inside the historical range, filling a gap

Toronto is a brand-new name. Portland readopted the name of the original Portland
Fire, which played 2000 to 2002 and folded. The asymmetry suggests the provider
may have reused the original Fire's identifier for the 2026 expansion team.

This matters because the entire franchise model rests on TEAM_ID meaning "the
same franchise". If the provider reuses an ID for a revived name, then TEAM_ID
actually means "the same provider identity", which here would span two unrelated
franchises 24 years apart. A career or franchise trend line drawn across that
boundary would assert a continuity that does not exist.

The pipeline already has a `lineage_break` flag for this case. What it does not
have is an answer about whether Portland needs one.

THE METHOD
----------
Probe seasons back to 1997 and record every TEAM_ID with its abbreviation.

Two things come out of it. First, whether the API serves pre-2018 WNBA data at
all, which is worth knowing regardless since it determines how far the history
window can ever extend. Second, if it does, whether 1611661327 appears in 2000
through 2002 as the original Fire.

WHAT THE ANSWER MEANS
---------------------
If 1611661327 appears in 2000-2002:
    The provider reuses IDs for revived names. Portland's 2026 identity needs
    lineage_break: true, its 2000-2002 era gets added to the registry, and the
    same trap must be checked for any future revival.

If it does not appear, or pre-2018 data is unavailable:
    No action. The ID landed in a gap by coincidence, or we cannot tell. Record
    the result either way so nobody re-litigates it from the numbering alone.

Run:  python spike_04_historical_ids.py
"""

from __future__ import annotations

import time
from collections import defaultdict

import pandas as pd
from nba_api.stats.endpoints import leaguedashplayerstats

WNBA_LEAGUE_ID = "10"
TIMEOUT = 45
PAUSE = 1.5

PORTLAND_2026_ID = 1611661327
TORONTO_2026_ID = 1611661332

# Season strings are named by their leading year (established by spike 01).
# The original Portland Fire played 2000, 2001 and 2002.
CANDIDATE_YEARS = list(range(1997, 2019))


def season_string(year: int) -> str:
    return f"{year}-{str(year + 1)[-2:]}"


def pull(year: int) -> pd.DataFrame | None:
    season = season_string(year)
    try:
        endpoint = leaguedashplayerstats.LeagueDashPlayerStats(
            league_id_nullable=WNBA_LEAGUE_ID,
            season=season,
            season_type_all_star="Regular Season",
            per_mode_detailed="PerGame",
            timeout=TIMEOUT,
        )
        frame = endpoint.get_data_frames()[0]
        return frame if not frame.empty else None
    except Exception as exc:  # noqa: BLE001
        print(f"  {year} ({season}): {type(exc).__name__}: {exc}")
        return None


def main() -> None:
    print("=" * 72)
    print("Court Vision spike 04: historical TEAM_ID reuse")
    print("=" * 72)

    by_id: dict[int, dict[int, str]] = defaultdict(dict)
    available: list[int] = []

    for year in CANDIDATE_YEARS:
        frame = pull(year)
        time.sleep(PAUSE)
        if frame is None:
            print(f"  {year}: no data")
            continue

        available.append(year)
        pairs = (
            frame[["TEAM_ID", "TEAM_ABBREVIATION"]]
            .dropna()
            .drop_duplicates()
            .itertuples(index=False)
        )
        teams = {}
        for team_id, abbr in pairs:
            by_id[int(team_id)][year] = str(abbr)
            teams[int(team_id)] = str(abbr)
        print(f"  {year}: {len(teams)} teams  {', '.join(sorted(teams.values()))}")

    print("\n" + "=" * 72)
    print("HISTORICAL AVAILABILITY")
    print("=" * 72)
    if not available:
        print("  No pre-2019 season returned data.")
        print("  VERDICT: cannot test the reuse hypothesis from this endpoint.")
        print("  Leave Portland recorded as 2026-onward and close the question.")
        return
    print(f"  Earliest season with data: {min(available)}")
    print(f"  Latest probed:             {max(available)}")

    print("\n" + "=" * 72)
    print("THE PORTLAND QUESTION")
    print("=" * 72)
    portland_history = by_id.get(PORTLAND_2026_ID, {})
    early = {y: a for y, a in portland_history.items() if y <= 2010}

    if early:
        print(f"  TEAM_ID {PORTLAND_2026_ID} APPEARS in early seasons:")
        for year, abbr in sorted(early.items()):
            print(f"    {year}: {abbr}")
        print()
        print("  VERDICT: the provider REUSES TEAM_IDs for revived franchises.")
        print("  TEAM_ID alone does not mean 'same franchise'.")
        print("  Action: set lineage_break: true on Portland's 2026 identity,")
        print("  add its earlier era to the registry, and treat this as a")
        print("  recurring trap for any future name revival.")
    elif available and min(available) <= 2002:
        print(f"  TEAM_ID {PORTLAND_2026_ID} does NOT appear in 2000-2002,")
        print("  and those seasons ARE available, so this is a real negative.")
        print()
        print("  VERDICT: no ID reuse. The identifier landed in a gap by")
        print("  coincidence. Portland stays recorded as 2026-onward.")
    else:
        print(f"  TEAM_ID {PORTLAND_2026_ID} is absent, but seasons 2000-2002")
        print("  were not available either, so this proves nothing.")
        print("  VERDICT: inconclusive. Leave the registry as it is.")

    print("\n" + "=" * 72)
    print("ANY OTHER ID WITH A LONG GAP")
    print("=" * 72)
    print("A gap of many seasons under one TEAM_ID is the signature of a revival.")
    found_gap = False
    for team_id, seasons in sorted(by_id.items()):
        years = sorted(seasons)
        gaps = [
            (a, b) for a, b in zip(years, years[1:], strict=False) if b - a > 3
        ]
        if gaps:
            found_gap = True
            for start, end in gaps:
                print(
                    f"  TEAM_ID {team_id}: {seasons[start]} in {start}, then "
                    f"{seasons[end]} in {end}  ({end - start} season gap)"
                )
    if not found_gap:
        print("  None found in the seasons that returned data.")


if __name__ == "__main__":
    main()
