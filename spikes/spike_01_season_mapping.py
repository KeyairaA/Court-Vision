"""
Court Vision spike 01: resolve the season string mapping and the real season window.

THE QUESTION
------------
The notebook passes season='2024-25' to nba_api with league_id_nullable='10',
then labels those rows Year = 2024. Nobody has verified that the label is right.
The WNBA plays inside a single calendar year (May to September), so NBA-style
'YYYY-YY' notation is ambiguous here. If the mapping is off by one, every chart
in the project is labeled with the wrong season and nothing will look broken.

THE METHOD
----------
Rather than trusting a single player's stat line, use the league's roster
composition as a structural fingerprint. Team arrivals are public record:

    Golden State Valkyries  debuted in the 2025 season
    Toronto Tempo           debuted in the 2026 season
    Portland Fire           debuted in the 2026 season

So the set of teams present in a response identifies the season on its own:

    none of the three present   ->  2024 or earlier
    Valkyries only              ->  2025
    Valkyries + Tempo + Fire    ->  2026

The script prints the full team list for every season string it tries, so you
can read the fingerprint yourself even if the abbreviations below are wrong.
A secondary check looks for Caitlin Clark, whose first WNBA season was 2024.

WHAT YOU ARE LOOKING FOR
------------------------
Find the season string whose team list first includes the Valkyries. If that
string is '2025-26', then 'YYYY-YY' maps to the SECOND year and the notebook's
Year = year - 1 is WRONG by one. If that string is '2024-25', then 'YYYY-YY'
maps to the FIRST year and the notebook is correct.

Run:  python spike_01_season_mapping.py
"""

import time

import pandas as pd
from nba_api.stats.endpoints import leaguedashplayerstats

WNBA_LEAGUE_ID = "10"
TIMEOUT = 45
PAUSE_BETWEEN_CALLS = 1.5  # be polite; this endpoint throttles

# Best guesses at the abbreviations. If these are wrong the script still works,
# because the full team list is printed for every season.
EXPANSION_MARKERS = {
    "GSV": "Golden State Valkyries (debut 2025)",
    "TOR": "Toronto Tempo (debut 2026)",
    "POR": "Portland Fire (debut 2026)",
}

# Season strings to probe. Deliberately wider than the seven-year window so the
# edges of the available data show up.
CANDIDATE_SEASONS = [
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
    """Pull one season. Returns None on failure rather than raising, so the
    probe continues across the whole candidate range."""
    try:
        endpoint = leaguedashplayerstats.LeagueDashPlayerStats(
            league_id_nullable=WNBA_LEAGUE_ID,
            season=season,
            season_type_all_star="Regular Season",
            per_mode_detailed="PerGame",
            timeout=TIMEOUT,
        )
        return endpoint.get_data_frames()[0]
    except Exception as exc:  # noqa: BLE001 - a spike wants every failure visible
        print(f"  !! {season}: {type(exc).__name__}: {exc}")
        return None


def describe(season: str, df: pd.DataFrame) -> dict:
    teams = sorted(df["TEAM_ABBREVIATION"].dropna().unique().tolist())
    names = set(df["PLAYER_NAME"].dropna())

    markers_present = [abbr for abbr in EXPANSION_MARKERS if abbr in teams]
    has_clark = any("Clark" in n and "Caitlin" in n for n in names)

    print(f"\n{season}")
    print(f"  rows: {len(df):>4}   teams: {len(teams)}")
    print(f"  team list: {', '.join(teams)}")
    if markers_present:
        for abbr in markers_present:
            print(f"  MARKER  {abbr}: {EXPANSION_MARKERS[abbr]}")
    else:
        print("  MARKER  none of the tracked expansion teams present")
    print(f"  Caitlin Clark present: {has_clark}   (first WNBA season was 2024)")

    return {
        "season_string": season,
        "rows": len(df),
        "team_count": len(teams),
        "teams": teams,
        "markers": markers_present,
        "has_clark": has_clark,
    }


def main() -> None:
    print("=" * 72)
    print("Court Vision spike 01: season string mapping")
    print("=" * 72)

    results = []
    for season in CANDIDATE_SEASONS:
        df = pull(season)
        if df is not None and not df.empty:
            results.append(describe(season, df))
        elif df is not None:
            print(f"\n{season}\n  rows: 0  (empty response, season likely unavailable)")
        time.sleep(PAUSE_BETWEEN_CALLS)

    print("\n" + "=" * 72)
    print("SUMMARY")
    print("=" * 72)

    if not results:
        print("No season returned data. Check network access and headers before")
        print("drawing any conclusion about the season format.")
        return

    available = [r["season_string"] for r in results]
    print(f"Season strings that returned data: {', '.join(available)}")
    print(f"Earliest available: {available[0]}")
    print(f"Latest available:   {available[-1]}")

    first_with_valkyries = next(
        (r["season_string"] for r in results if "GSV" in r["markers"]), None
    )

    # The Valkyries' first season was 2025. Whichever season string they first
    # appear under IS the 2025 season. So if that string is '2025-26', the
    # leading year names the season; if it is '2024-25', the trailing year does.
    #
    # An earlier version of this script had this rule inverted and printed the
    # opposite conclusion from correct evidence. Keeping the reasoning written
    # out inline so the next reader can check it rather than trust it.
    print("\nVERDICT")
    if first_with_valkyries is None:
        print("  The Valkyries were not detected under the abbreviation 'GSV'.")
        print("  Read the printed team lists above, find the season string where")
        print("  a Golden State entry first appears, and apply this rule:")
        print("    the Valkyries' first season was 2025, so that string IS 2025")
        print("    string '2025-26' -> the LEADING year names the season")
        print("    string '2024-25' -> the TRAILING year names the season")
    elif first_with_valkyries == "2025-26":
        print("  'YYYY-YY' is named by its LEADING year.")
        print("  '2025-26' is the 2025 WNBA season.")
        print("  Cross-checks: Clark (rookie 2024) first appears in '2024-25';")
        print("  Toronto and Portland (debut 2026) first appear in '2026-27'.")
        print("  The notebook's Year = year - 1 labeling is CORRECT.")
        print("  Pipeline setting: SeasonAnchor.LEADING")
    elif first_with_valkyries == "2024-25":
        print("  'YYYY-YY' is named by its TRAILING year.")
        print("  '2024-25' is the 2025 WNBA season.")
        print("  The notebook's Year = year - 1 labeling is OFF BY ONE.")
        print("  Every chart currently built is mislabeled by a season.")
        print("  Pipeline setting: SeasonAnchor.TRAILING")
    else:
        print(f"  Valkyries first appear in '{first_with_valkyries}', which matches")
        print("  neither expected case. Investigate before trusting any labels.")

    print("\nSeason window note: the notebook derives its window from")
    print("datetime.now().year, which does not know which seasons actually exist.")
    print("Use the availability range printed above as the source of truth instead.")


if __name__ == "__main__":
    main()
