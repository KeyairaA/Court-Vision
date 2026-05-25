import streamlit as st

pg = st.navigation([
    st.Page("pages/analytics.py", title="Analytics Dashboard"),
    st.Page("pages/leaderboard.py", title="Player Leaderboard"),
    st.Page("pages/comparison.py", title="Player Comparison"),
])
pg.run()