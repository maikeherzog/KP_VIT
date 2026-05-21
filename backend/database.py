"""
Database setup (SQLite) 
"""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "data" / "universe.db"


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  
    conn.execute("PRAGMA journal_mode=WAL")  
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    """Create all tables if they don't exist yet."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = get_connection()
    cur = conn.cursor()

    # repositories — one row per unique GitHub repo                        
    cur.execute("""
        CREATE TABLE IF NOT EXISTS repositories (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,

            -- identity
            owner               TEXT NOT NULL,
            name                TEXT NOT NULL,
            full_name           TEXT NOT NULL UNIQUE,   -- "owner/name"

            -- GitHub API enrichment
            description         TEXT,
            language            TEXT,           -- primary language → galaxy
            topics              TEXT,           -- JSON array stored as text
            homepage            TEXT,
            license             TEXT,

            -- size metrics
            github_stars        INTEGER DEFAULT 0,
            github_forks        INTEGER DEFAULT 0,
            open_issues         INTEGER DEFAULT 0,
            watchers            INTEGER DEFAULT 0,

            -- lifecycle
            created_at          TEXT,           -- ISO-8601
            pushed_at           TEXT,           -- last push → staleness signal
            is_archived         INTEGER DEFAULT 0,  -- 0/1 bool
            is_fork             INTEGER DEFAULT 0,

            -- enrichment bookkeeping
            enriched_at         TEXT,           -- timestamp of last API call
            enrichment_failed   INTEGER DEFAULT 0,  -- 1 if GitHub API returned error

            -- aggregated trending metrics (computed from trending_history)
            trending_count      INTEGER DEFAULT 0,  -- how many days appeared in trending
            first_trending_date TEXT,
            last_trending_date  TEXT,
            best_ranking        INTEGER,            -- lowest rank number (1 = best)
            peak_stars          INTEGER DEFAULT 0,  -- highest star count seen in trending

            -- habitability score (0.0 – 1.0, computed by scoring script)
            habitability_score  REAL DEFAULT 0.0,
            star_type           TEXT DEFAULT 'main_sequence',
            -- 'main_sequence' | 'red_giant' | 'white_dwarf' | 'black_hole'

            -- LLM narration cache
            narration_text      TEXT,
            narration_audio_path TEXT,
            narration_generated_at TEXT
        )
    """)

    # trending_history — one row per daily CSV entry (raw data)            
    cur.execute("""
        CREATE TABLE IF NOT EXISTS trending_history (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            repo_id     INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
            date        TEXT NOT NULL,      -- "YYYY-MM-DD"
            ranking     INTEGER,            -- position in trending list that day
            star_count  INTEGER DEFAULT 0
        )
    """)

    # Indexes                                                              
    cur.execute("CREATE INDEX IF NOT EXISTS idx_repos_language    ON repositories(language)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_repos_habitability ON repositories(habitability_score DESC)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_repos_stars        ON repositories(github_stars DESC)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_repos_full_name    ON repositories(full_name)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_history_repo_id    ON trending_history(repo_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_history_date       ON trending_history(date)")

    conn.commit()
    conn.close()
    print(f"Database initialised at {DB_PATH}")


if __name__ == "__main__":
    init_db()
