import streamlit as st
import pandas as pd
import plotly.express as px
from utils import load_data

data_all = load_data()

st.title("Player Comparison")

# ── Advanced metrics on full dataset ─────────────────────────────────────────
data_all = data_all.copy()
data_all['TRU%'] = 0.5 * data_all['PTS'] / (data_all['FGA'] + 0.475 * data_all['FTA'])
data_all['AST_TOV%'] = data_all['AST'] / data_all['TOV'].replace(0, float('nan'))

# ── Player search ─────────────────────────────────────────────────────────────
all_players = sorted(data_all['PLAYER'].unique())

col1, col2 = st.columns(2)
with col1:
    player1 = st.selectbox("Player 1", all_players, index=0)
with col2:
    player2 = st.selectbox("Player 2", all_players, index=1)

if player1 == player2:
    st.warning("Select two different players.")
    st.stop()

# ── Season filter ─────────────────────────────────────────────────────────────
season = st.sidebar.selectbox(
    "Season", ["All (career avg)"] + sorted(data_all['Year'].unique(), reverse=True)
)

stat_cols = ['GP', 'MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'TOV',
             'FG_PCT', 'FG3_PCT', 'FT_PCT', 'TRU%', 'AST_TOV%']

def get_player_stats(name):
    df = data_all[data_all['PLAYER'] == name]
    if season != "All (career avg)":
        df = df[df['Year'] == season]
    return df[stat_cols].mean().round(3)

p1_stats = get_player_stats(player1)
p2_stats = get_player_stats(player2)

# ── Side-by-side stat table ───────────────────────────────────────────────────
st.subheader("Head to Head")

comparison_df = pd.DataFrame({
    player1: p1_stats,
    player2: p2_stats,
}).T

st.dataframe(
    comparison_df.style.highlight_max(axis=0, color="#0b7023"),
    use_container_width=True
)
st.caption("Green highlight = higher value for that stat")

# ── Bar chart comparison ──────────────────────────────────────────────────────
st.subheader("Stat Comparison")

viz_stats = ['PTS', 'REB', 'AST', 'STL', 'BLK', 'TRU%', 'AST_TOV%']
selected_stats = st.multiselect(
    "Choose stats to compare",
    viz_stats,
    default=['PTS', 'REB', 'AST', 'TRU%']
)

if selected_stats:
    chart_data = pd.DataFrame({
        'Stat': selected_stats * 2,
        'Value': [p1_stats[s] for s in selected_stats] + [p2_stats[s] for s in selected_stats],
        'Player': [player1] * len(selected_stats) + [player2] * len(selected_stats)
    })

    fig = px.bar(
        chart_data,
        x='Stat',
        y='Value',
        color='Player',
        barmode='group',
        title=f"{player1} vs {player2}",
        text='Value'
    )
    fig.update_traces(textposition='outside')
    fig.update_layout(height=450)
    st.plotly_chart(fig, use_container_width=True)

# ── Career arc ────────────────────────────────────────────────────────────────
st.subheader("Career Trend")

arc_stat = st.selectbox("Stat to track over time", ['PTS', 'REB', 'AST', 'MIN', 'TRU%', 'AST_TOV%'])

p1_arc = data_all[data_all['PLAYER'] == player1].groupby('Year')[arc_stat].mean().reset_index()
p1_arc['Player'] = player1

p2_arc = data_all[data_all['PLAYER'] == player2].groupby('Year')[arc_stat].mean().reset_index()
p2_arc['Player'] = player2

arc_df = pd.concat([p1_arc, p2_arc])

if arc_df.empty:
    st.info("No multi-season data available for this selection.")
else:
    fig_arc = px.line(
        arc_df,
        x='Year',
        y=arc_stat,
        color='Player',
        markers=True,
        title=f"{arc_stat} over time — {player1} vs {player2}",
    )
    fig_arc.update_layout(height=400)
    st.plotly_chart(fig_arc, use_container_width=True)