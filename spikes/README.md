# Court Vision spikes

Three throwaway scripts that answer questions which would be expensive to get
wrong later. None of this code survives into the real project. Run them, read
the verdicts, then delete them.

## Before you start

```bash
pip install nba_api pandas
```

## Spike 01: season string mapping

```bash
python spike_01_season_mapping.py
```

Answers: when you pass `season='2024-25'` with `league_id_nullable='10'`, which
actual WNBA season comes back?

This matters because the WNBA plays inside a single calendar year, so NBA-style
`YYYY-YY` notation is ambiguous. The notebook currently labels `'2024-25'` as
Year 2024. If that is off by one, every chart in the project is mislabeled by a
season and nothing looks broken.

Rather than checking one player's stat line, the script uses roster composition
as a fingerprint. The Valkyries joined in 2025, Toronto and Portland in 2026, so
the set of teams present identifies the season on its own. The full team list
prints for every season, so you can read it yourself even if my guessed
abbreviations are wrong.

**What to look for:** the season string where a Golden State entry first
appears. If it is `'2025-26'`, the notebook is off by one. If it is `'2024-25'`,
the notebook is correct.

It also prints which season strings return data at all, which replaces the
`datetime.now().year` window logic. That logic currently gives you 2019 through
2025 and silently omits the 2026 season that just finished.

## Spike 02: team identity stability

```bash
python spike_02_team_identity.py
```

Answers: is `TEAM_ID` a stable franchise anchor?

The franchise model rests on `TEAM_ID` surviving relocations while
`TEAM_ABBREVIATION` changes. The notebook does the opposite, dropping `TEAM_ID`
and keying on the abbreviation. This becomes load bearing in 2027 when the
Connecticut Sun become the Houston Comets.

The script looks for one `TEAM_ID` carrying different abbreviations across
seasons, which proves the ID survives a rebrand, and for one abbreviation shared
by multiple IDs, which proves abbreviations are unsafe as keys.

Finding neither is inconclusive rather than reassuring. It most likely means no
rename has happened inside the window yet, which is precisely what changes in
2027. The pipeline should assert on this rather than assume it.

The script also prints a franchise registry seed you can paste into
`pipeline/data/franchises.yaml` as a starting point.

## Spike 03: CI reachability

Copy `.github/workflows/spike-ci-reachability.yml` into your repo, commit, then
trigger it by hand from the Actions tab. Do not wait for a schedule.

Answers: can a GitHub Actions runner reach the stats API at all?

The scheduled refresh design assumes it can. Direct requests already failed
during development, and CI runners sit on datacenter IPs that get treated more
suspiciously than a home connection.

If it fails, the architecture is unchanged but the scheduler moves. In order of
preference: an external trigger such as a Cloudflare Worker, a self-hosted
runner on a residential connection, or a local refresh that pushes artifacts.

## One correction worth carrying forward

`nba_api` sends WNBA requests to **`stats.nba.com`** with `LeagueID=10`, not to
`stats.wnba.com`. That was confirmed from the actual request URL in a failed
call. `stats.nba.com` is the host that has to be reachable, allowlisted, and
monitored. The project docs have been corrected.
