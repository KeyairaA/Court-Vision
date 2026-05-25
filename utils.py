import streamlit as st
import pandas as pd
import datetime
import time
from nba_api.stats.endpoints import leaguedashplayerstats

@st.cache_data
def load_data():
    current_year = datetime.datetime.now().year
    all_seasons = []

    for i in reversed(range(7)):
        year = current_year - i
        season_str = f'{year-1}-{str(year)[-2:]}'
        stats = leaguedashplayerstats.LeagueDashPlayerStats(
            league_id_nullable='10',
            season=season_str,
            season_type_all_star='Regular Season',
            per_mode_detailed='PerGame'
        )
        time.sleep(1)
        df = stats.get_data_frames()[0]
        df = df.rename(columns={'PLAYER_NAME': 'PLAYER', 'TEAM_ABBREVIATION': 'TEAM'})
        df['Year'] = year - 1
        df['Season_type'] = 'Regular Season'
        df = df.drop(columns=['TEAM_ID', 'NICKNAME', 'AGE', 'W', 'L', 'W_PCT', 'BLKA',
                               'PF', 'PFD', 'PLUS_MINUS', 'NBA_FANTASY_PTS', 'DD2', 'TD3',
                               'WNBA_FANTASY_PTS', 'GP_RANK', 'W_RANK', 'L_RANK', 'W_PCT_RANK',
                               'MIN_RANK', 'FGM_RANK', 'FGA_RANK', 'FG_PCT_RANK', 'FG3M_RANK',
                               'FG3A_RANK', 'FG3_PCT_RANK', 'FTM_RANK', 'FTA_RANK', 'FT_PCT_RANK',
                               'OREB_RANK', 'DREB_RANK', 'REB_RANK', 'AST_RANK', 'TOV_RANK',
                               'STL_RANK', 'BLK_RANK', 'BLKA_RANK', 'PF_RANK', 'PFD_RANK',
                               'PTS_RANK', 'PLUS_MINUS_RANK', 'NBA_FANTASY_PTS_RANK', 'DD2_RANK',
                               'TD3_RANK', 'WNBA_FANTASY_PTS_RANK', 'TEAM_COUNT'])
        df = df[['Year', 'Season_type', 'PLAYER_ID', 'PLAYER', 'TEAM', 'GP', 'MIN',
                 'FGM', 'FGA', 'FG_PCT', 'FG3M', 'FG3A', 'FG3_PCT', 'FTM', 'FTA',
                 'FT_PCT', 'OREB', 'DREB', 'REB', 'AST', 'STL', 'BLK', 'TOV', 'PTS']]
        df['TEAM'] = df['TEAM'].replace('SAN', 'LVA')
        all_seasons.append(df)

    return pd.concat(all_seasons, ignore_index=True)