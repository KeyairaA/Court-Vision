"""
Court Vision spike 02: is TEAM_ID a stable franchise anchor?

THE QUESTION
------------
The franchise model assumes TEAM_ID is stable across relocations and rebrands,
while TEAM_ABBREVIATION is a volatile display label. The whole design rests on
that assumption, and the notebook currently does the opposite: it drops TEAM_ID
and keys on TEAM_ABBREVIATION.

This becomes load bearing in 2027, when the Connecticut Sun become the Houston
Comets. Verifying it now is cheap. Discovering it was wrong after the site is
live is not.

THE METHOD
----------
Pull every available season, build a TEAM_ID to TEAM_ABBREVIATION mapping per
season, then look for two specific things:

  1. One TEAM_ID carrying different abbreviations in different seasons.
     That PROVES TEAM_ID survives a rebrand and is safe to key on.

  2. One abbreviation shared by more than one TEAM_ID.
     That PROVES abbreviations are not unique and are unsafe to key on.

Either finding validates the franchise model. Finding neither is inconclusive
rather than reassuring: it most likely means no rename happened inside the
window yet, which is exactly the situation that changes in 2027.

Run:  python spike_02_team_identity.py
"""

import json
import time
from collections import defaultdict

import pandas as pd
from nba_api.stats.endpoints import leaguedashplayerstats

WNBA_LEAGUE_ID = "10"
TIMEOUT = 45
PAUSE_BETWEEN_CALLS = 1.5

# Spike 01 established that the API serves 2018 through 2026, and that a season
# string is named by its LEADING year. The first run of this script stopped at
# '2025-26' and therefore missed Toronto and Portland entirely.
SEASONS = [
    "2018-19",
    "2019-20",
    "2020-21",
    "2021-22",
    "2022-23",
    "2023-24",
    "2024-25",
    "2025-26",
    "2026-27",
]


def pull(season: str) -> pd.DataFrame | None:
    try:
        endpoint = leaguedashplayerstats.LeagueDashPlayerStats(
            league_id_nullable=WNBA_LEAGUE_ID,
            season=season,
            season_type_all_star="Regular Season",
            per_mode_detailed="PerGame",
            timeout=TIMEOUT,
        )
        return endpoint.get_data_frames()[0]
    except Exception as exc:  # noqa: BLE001
        print(f"  !! {season}: {type(exc).__name__}: {exc}")
        return None


def main() -> None:
    print("=" * 72)
    print("Court Vision spike 02: team identity stability")
    print("=" * 72)

    # team_id -> season -> abbreviation
    by_id: dict[int, dict[str, str]] = defaultdict(dict)
    # abbreviation -> set of team_ids
    by_abbr: dict[str, set[int]] = defaultdict(set)
    season_team_counts: dict[str, int] = {}

    for season in SEASONS:
        df = pull(season)
        time.sleep(PAUSE_BETWEEN_CALLS)
        if df is None or df.empty:
            continue

        pairs = (
            df[["TEAM_ID", "TEAM_ABBREVIATION"]]
            .dropna()
            .drop_duplicates()
            .itertuples(index=False)
        )
        count = 0
        for team_id, abbr in pairs:
            by_id[int(team_id)][season] = str(abbr)
            by_abbr[str(abbr)].add(int(team_id))
            count += 1
        season_team_counts[season] = count
        print(f"  {season}: {count} teams")

    if not by_id:
        print("\nNo data retrieved. Nothing can be concluded.")
        return

    print("\n" + "=" * 72)
    print("TEAM COUNT BY SEASON  (expansion should show up here)")
    print("=" * 72)
    for season, count in season_team_counts.items():
        print(f"  {season}: {count}")

    print("\n" + "=" * 72)
    print("FINDING 1: does any TEAM_ID change its abbreviation?")
    print("=" * 72)
    renamed = {
        team_id: seasons
        for team_id, seasons in by_id.items()
        if len(set(seasons.values())) > 1
    }
    if renamed:
        print("  YES. TEAM_ID survives a rebrand and is safe as the franchise key.")
        for team_id, seasons in renamed.items():
            trail = " -> ".join(
                f"{s}:{a}" for s, a in sorted(seasons.items())
            )
            print(f"    TEAM_ID {team_id}: {trail}")
    else:
        print("  No rename observed inside this window. Inconclusive rather than")
        print("  reassuring: re-run this after the 2027 Sun to Comets move, and")
        print("  have the pipeline assert on it rather than assuming.")

    print("\n" + "=" * 72)
    print("FINDING 2: is any abbreviation shared by more than one TEAM_ID?")
    print("=" * 72)
    collisions = {a: ids for a, ids in by_abbr.items() if len(ids) > 1}
    if collisions:
        print("  YES. Abbreviations are NOT unique and must never be a join key.")
        for abbr, ids in collisions.items():
            print(f"    {abbr}: TEAM_IDs {sorted(ids)}")
    else:
        print("  No collision inside this window, as expected. The risk is real")
        print("  but historical: the original Houston Comets (1997-2008) folded,")
        print("  and the 2027 Comets are a different franchise reusing the name.")

    print("\n" + "=" * 72)
    print("FRANCHISE REGISTRY SEED")
    print("=" * 72)
    print("Paste this into pipeline/data/franchises.yaml as a starting point,")
    print("then add lineage, full names, colors and logos by hand.\n")
    registry = {
        str(team_id): {
            "abbreviations_by_season": dict(sorted(seasons.items())),
            "current_abbreviation": seasons[max(seasons)],
        }
        for team_id, seasons in sorted(by_id.items())
    }
    print(json.dumps(registry, indent=2))


if __name__ == "__main__":
    main()
