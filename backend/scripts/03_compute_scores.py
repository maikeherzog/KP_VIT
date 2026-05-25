"""
Compute Habitability Scores & Star Types
"""

import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from database import get_connection

# must be in total 1.0 
W_RECENCY       = 0.35   # how recently was the repo pushed?
W_TRENDING      = 0.25   # how often / recently did it trend?
W_POPULARITY    = 0.25   # star count (log-scaled)
W_ISSUES        = 0.15   # open issues (shows activity)

BATCH_SIZE = 500


import math

def _score_recency(pushed_at: str | None, now: datetime) -> float:
    """Decay from 1.0 (pushed today) to 0.0 (not pushed in > 3 years)."""
    if not pushed_at:
        return 0.0
    try:
        pushed = datetime.fromisoformat(pushed_at.replace("Z", "+00:00"))
        days_ago = (now - pushed).days
        # half-life of 180 days
        return math.exp(-days_ago / 180)
    except ValueError:
        return 0.0


def _score_trending(trending_count: int, last_trending_date: str | None, now: datetime) -> float:
    if not trending_count:
        return 0.0

    freq = min(math.log1p(trending_count) / math.log1p(100), 1.0)

    recency = 0.0
    if last_trending_date:
        try:
            last = datetime.fromisoformat(last_trending_date)
            if last.tzinfo is None:
                last = last.replace(tzinfo=timezone.utc)
            days_ago = (now - last).days
            recency = math.exp(-days_ago / 365)  
        except ValueError:
            pass

    return 0.5 * freq + 0.5 * recency


def _score_popularity(stars: int) -> float:
    if stars <= 0:
        return 0.0
    return min(math.log1p(stars) / math.log1p(100_000), 1.0)


def _score_issues(open_issues: int) -> float:
    
    if open_issues <= 0:
        return 0.1
    log_issues = math.log1p(open_issues)
    peak = math.log1p(200)
    score = 1.0 - abs(log_issues - peak) / peak
    return max(0.0, min(score, 1.0))


def compute_habitability(row: dict, now: datetime) -> tuple[float, str]:
    """Return (habitability_score, star_type)."""

    if row["is_archived"]:
        return 0.0, "black_hole"

    if row["enrichment_failed"]:
        return 0.05, "white_dwarf"

    score = (
        W_RECENCY    * _score_recency(row["pushed_at"], now)
        + W_TRENDING * _score_trending(
            row["trending_count"] or 0,
            row["last_trending_date"],
            now,
        )
        + W_POPULARITY * _score_popularity(row["github_stars"] or 0)
        + W_ISSUES     * _score_issues(row["open_issues"] or 0)
    )
    score = round(max(0.0, min(score, 1.0)), 4)

    # map score → star type
    was_popular = (row["trending_count"] or 0) >= 5 or (row["peak_stars"] or 0) >= 1000
    if score >= 0.6:
        star_type = "main_sequence"
    elif score >= 0.3 and was_popular:
        star_type = "red_giant"
    elif score >= 0.1:
        star_type = "white_dwarf"
    else:
        star_type = "black_hole"

    return score, star_type




def compute_all():
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) AS n FROM repositories")
    total = cur.fetchone()["n"]
    print(f"Scoring {total:,} repositories …")

    now = datetime.now(timezone.utc)
    updated = 0
    offset = 0

    while True:
        cur.execute("""
            SELECT
                id, pushed_at, is_archived, enrichment_failed,
                trending_count, last_trending_date,
                github_stars, open_issues, peak_stars
            FROM repositories
            LIMIT ? OFFSET ?
        """, (BATCH_SIZE, offset))
        rows = cur.fetchall()
        if not rows:
            break

        batch: list[tuple] = []
        for row in rows:
            score, star_type = compute_habitability(dict(row), now)
            batch.append((score, star_type, row["id"]))

        cur.executemany(
            "UPDATE repositories SET habitability_score = ?, star_type = ? WHERE id = ?",
            batch,
        )
        conn.commit()

        updated += len(rows)
        offset += BATCH_SIZE
        print(f"   … {updated:,}/{total:,} scored")

    conn.close()
    print(f"\n All scores computed.")

    _print_summary()


def _print_summary():
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT star_type, COUNT(*) AS n,
               ROUND(AVG(habitability_score), 3) AS avg_score
        FROM repositories
        GROUP BY star_type
        ORDER BY avg_score DESC
    """)
    print("\n Star type distribution:")
    print(f"   {'Type':<16} {'Count':>8} {'Avg score':>10}")
    print("   " + "-" * 36)
    for row in cur.fetchall():
        print(f"   {row['star_type']:<16} {row['n']:>8,} {row['avg_score']:>10.3f}")
    conn.close()


if __name__ == "__main__":
    compute_all()
