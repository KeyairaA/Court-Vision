import streamlit as st
from utils import load_data

data_all = load_data()

# ── 3. UI — sidebar and everything else goes below here ───────────────────────
st.title("WNBA Player Analytics Dashboard")

season = st.sidebar.selectbox("Season", sorted(data_all['Year'].unique(), reverse=True))
team = st.sidebar.multiselect("Team", sorted(data_all['TEAM'].unique()))
min_minutes = st.sidebar.slider("Min minutes per game", 5, 35, 10)


filtered = data_all[data_all['Year'] == season]
if team:
    filtered = filtered[filtered['TEAM'].isin(team)]

filtered = filtered[filtered['MIN'] >= min_minutes]

filtered = filtered.copy()
filtered['TRU%'] = 0.5 * filtered['PTS'] / (filtered['FGA'] + 0.475 * filtered['FTA'])
filtered['AST_TOV%'] = filtered['AST'] / filtered['TOV'].replace(0, float('nan'))

st.dataframe(filtered)

