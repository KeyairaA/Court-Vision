"""Metric formulas. The single tested place any rate is computed.

WHY THIS MODULE EXISTS
----------------------
The Streamlit app computes True Shooting and assist-to-turnover in three
separate files, once per page, with the formula written out longhand each time.
Fixing the coefficient there means finding three copies and hoping none was
missed. That is the drift this module exists to prevent.

Everything here is a pure function over pandas Series. No I/O, no DataFrame
assumptions beyond the columns passed in, nothing that needs a network. That is
what makes it cheap to test exhaustively.

ZERO DENOMINATORS
-----------------
Every ratio routes its denominator through a zero-to-NaN replacement before
dividing. A player with no field goal attempts must produce NaN, not inf.

This is not defensive noise. An inf in a correlation matrix silently poisons
every coefficient it touches, and the result still renders as a chart, which is
the worst kind of failure: wrong and confident.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

FREE_THROW_ATTEMPT_COEFFICIENT = 0.44
"""The share of free throw attempts treated as ending a possession.

0.44 is the basketball analytics convention and what every public reference
source uses. The existing Streamlit app uses 0.475, which is not standard.

That difference is not cosmetic. Measured against 2017 WNBA data for the 99
players with at least 100 field goal attempts, the mean absolute difference in
TS% is only 0.0046, but 51 of those 99 players change rank position depending on
which coefficient is used. On a leaderboard, half the field reorders.

If this is ever changed, the methodology page must say so explicitly, because a
reader cross-checking against any reference site will otherwise find that the
numbers disagree and conclude the site is wrong.
"""

MINUTES_NORMALIZATION_BASE = 36
"""Per-36-minutes is the conventional rate basis in basketball.

The notebook used raw per-minute, which is correct arithmetic but produces
values nobody has intuition for. Per-36 approximates a starter's workload, so
the numbers read like box score lines.
"""


def _safe_denominator(series: pd.Series) -> pd.Series:
    """Zeros become NaN so division yields NaN rather than inf."""
    return series.replace(0, np.nan)


def true_shooting_pct(
    pts: pd.Series,
    fga: pd.Series,
    fta: pd.Series,
    ft_coefficient: float = FREE_THROW_ATTEMPT_COEFFICIENT,
) -> pd.Series:
    """True Shooting percentage.

        TS% = PTS / (2 * (FGA + 0.44 * FTA))

    A single number for scoring efficiency that accounts for the fact that
    threes are worth more than twos and that free throws are only a fraction of
    a possession.
    """
    denominator = _safe_denominator(2 * (fga + ft_coefficient * fta))
    return pts / denominator


def effective_fg_pct(fgm: pd.Series, fg3m: pd.Series, fga: pd.Series) -> pd.Series:
    """Effective field goal percentage.

        eFG% = (FGM + 0.5 * FG3M) / FGA

    Field goal percentage adjusted for three-pointers being worth more. Unlike
    TS%, it ignores free throws entirely.
    """
    return (fgm + 0.5 * fg3m) / _safe_denominator(fga)


def three_point_attempt_rate(fg3a: pd.Series, fga: pd.Series) -> pd.Series:
    """Share of field goal attempts taken from three.

        3PAr = FG3A / FGA

    NOT the same as three-point percentage, which is FG3M / FG3A. The notebook
    originally defined a column called FG3A% as FG3M / FG3A, making it an exact
    duplicate of 3PT%. This is the corrected, genuinely distinct metric: it
    measures shot selection rather than accuracy.
    """
    return fg3a / _safe_denominator(fga)


def free_throw_rate(fta: pd.Series, fga: pd.Series) -> pd.Series:
    """Free throw attempts per field goal attempt.

        FTr = FTA / FGA

    A proxy for how often a player attacks the rim or draws contact.
    """
    return fta / _safe_denominator(fga)


def assist_to_turnover(ast: pd.Series, tov: pd.Series) -> pd.Series:
    """Assists per turnover. Undefined for a player with no turnovers.

    Returning NaN rather than inf for a zero-turnover player is deliberate. A
    player with 2 assists and 0 turnovers does not have infinitely good ball
    security; the sample is simply too small to say.
    """
    return ast / _safe_denominator(tov)


def per_minutes(
    stat: pd.Series,
    minutes: pd.Series,
    base: int = MINUTES_NORMALIZATION_BASE,
) -> pd.Series:
    """Scale a counting stat to a per-`base`-minutes rate.

    Pass base=1 for raw per-minute.
    """
    if base <= 0:
        raise ValueError(f"base must be positive, got {base}")
    return stat / _safe_denominator(minutes) * base


def shooting_pct(makes: pd.Series, attempts: pd.Series) -> pd.Series:
    """Plain makes over attempts: FG%, 3P%, FT%."""
    return makes / _safe_denominator(attempts)


RATE_COLUMNS: tuple[str, ...] = (
    "fg_pct",
    "fg3_pct",
    "ft_pct",
    "ts_pct",
    "efg_pct",
    "fg3a_rate",
    "ftr",
    "ast_to",
)


def add_rate_metrics(
    frame: pd.DataFrame,
    ft_coefficient: float = FREE_THROW_ATTEMPT_COEFFICIENT,
) -> pd.DataFrame:
    """Return a copy of `frame` with every rate metric appended.

    Operates on season totals, not per-game averages. Computing a rate from
    totals and computing it from per-game averages give the same answer for
    these formulas, but totals avoid a rounding step.
    """
    out = frame.copy()
    # Recomputed from totals rather than trusting any source-supplied
    # percentage column, so every percentage on the site is a ratio of sums.
    out["fg_pct"] = shooting_pct(out["fgm"], out["fga"])
    out["fg3_pct"] = shooting_pct(out["fg3m"], out["fg3a"])
    out["ft_pct"] = shooting_pct(out["ftm"], out["fta"])
    out["ts_pct"] = true_shooting_pct(
        out["pts"], out["fga"], out["fta"], ft_coefficient=ft_coefficient
    )
    out["efg_pct"] = effective_fg_pct(out["fgm"], out["fg3m"], out["fga"])
    out["fg3a_rate"] = three_point_attempt_rate(out["fg3a"], out["fga"])
    out["ftr"] = free_throw_rate(out["fta"], out["fga"])
    out["ast_to"] = assist_to_turnover(out["ast"], out["tov"])
    return out


PER_MINUTE_STATS: tuple[str, ...] = (
    "pts",
    "reb",
    "oreb",
    "dreb",
    "ast",
    "stl",
    "blk",
    "tov",
    "fga",
    "fg3a",
    "fta",
)


def add_per_minute_metrics(
    frame: pd.DataFrame,
    stats: tuple[str, ...] = PER_MINUTE_STATS,
    base: int = MINUTES_NORMALIZATION_BASE,
) -> pd.DataFrame:
    """Append per-`base`-minutes columns, suffixed `_per{base}`."""
    out = frame.copy()
    for stat in stats:
        out[f"{stat}_per{base}"] = per_minutes(out[stat], out["min"], base=base)
    return out


def add_per_game_metrics(
    frame: pd.DataFrame,
    stats: tuple[str, ...] = PER_MINUTE_STATS + ("min",),
) -> pd.DataFrame:
    """Append per-game columns, suffixed `_pg`."""
    out = frame.copy()
    games = _safe_denominator(out["gp"])
    for stat in stats:
        out[f"{stat}_pg"] = out[stat] / games
    return out
