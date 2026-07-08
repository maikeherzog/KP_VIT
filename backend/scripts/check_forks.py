import sqlite3

conn = sqlite3.connect("../data/universe.db")
row = conn.execute("""
    SELECT COUNT(*) AS total, SUM(fork_stars = 0) AS zero_star
    FROM forks
    WHERE fork_full_name NOT IN ('__NO_FORKS__', '__FETCH_FAILED__')
""").fetchone()
print(f"total={row[0]}  zero_star={row[1]}")
