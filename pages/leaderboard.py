import streamlit as st
import plotly.express as px
from utils import load_data

data_all = load_data()

# ── 4. Leaderboard ─────────────────────────────────────────────────────────────
st.subheader("Player Leaderboard")

season = st.sidebar.selectbox("Season", sorted(data_all['Year'].unique(), reverse=True))
team = st.sidebar.multiselect("Team", sorted(data_all['TEAM'].unique()))

filtered = data_all[data_all['Year'] == season]
if team:
    filtered = filtered[filtered['TEAM'].isin(team)]

filtered = filtered.copy()
filtered['TRU%'] = 0.5 * filtered['PTS'] / (filtered['FGA'] + 0.475 * filtered['FTA'])
filtered['AST_TOV%'] = filtered['AST'] / filtered['TOV'].replace(0, float('nan'))

# Stats options - includes advanced metrics
stats_options = {
    "Points (PTS)": "PTS",
    "Rebounds (REB)": "REB",
    "Assists (AST)": "AST",
    "Steals (STL)": "STL",
    "Blocks (BLK)": "BLK",
    "True Shooting % (TRU%)": "TRU%",
    "AST/TOV Ratio": "AST_TOV%",
    "FG%": "FG_PCT",
    "3PT%": "3PT_PCT",
    "Minutes (MIN)": "MIN",
}

col1, col2, = st.columns([2, 1])

with col1:
    selected_label = st.selectbox("Sort leaderboard by", list(stats_options.keys()))

with col2:
    top_name = st.selectbox("Show top", [5, 10, 15, 20], index=1)

selected_stat = stats_options[selected_label]

# Build leaderboard from filtered data, drop players missing the stat
leaderboard = (
    filtered[['PLAYER', 'TEAM', selected_stat]]
    .dropna(subset=[selected_stat])
    .sort_values(selected_stat, ascending=False)
    .head(top_name)
    .reset_index(drop=True)
)
leaderboard.index += 1 # start ranking at 1

fig_lb = px.bar(
    leaderboard,
    x = selected_stat,
    y = 'PLAYER',
    color = 'TEAM',
    text = leaderboard[selected_stat].round(3),
    title = f"Top {top_name} - {selected_label}",
    labels = {selected_stat: selected_label, 'PLAYER': ''},
)

fig_lb.update_layout(
    yaxis = dict(autorange = 'reversed'), # highest value at the top
    showlegend = True,
    height = 400 + (top_name * 10),
)

fig_lb.update_traces(textposition = 'outside')
st.plotly_chart(fig_lb, use_container_width=True)