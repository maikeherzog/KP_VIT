"""
/languages endpoints
"""

from fastapi import APIRouter, Query
from pydantic import BaseModel

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from database import get_connection

router = APIRouter()

# Fallback year if a language is not found in the Kaggle dataset
FALLBACK_YEAR = 2000


def _get_year_bounds(cur) -> tuple[int, int]:
    """Get min and max appeared years from the programming_languages table."""
    cur.execute("""
        SELECT MIN(appeared) AS min_year, MAX(appeared) AS max_year
        FROM programming_languages
        WHERE appeared IS NOT NULL
    """)
    row = cur.fetchone()
    min_year = row["min_year"] or 1950
    max_year = row["max_year"] or 2024
    return min_year, max_year


def year_to_distance(year: int, min_year: int, max_year: int) -> float:
    """
    Convert a birth year to a normalised radial distance from center.
    Older (smaller year) → larger distance (outer rim).
    Newer (larger year)  → smaller distance (near center).
    Returns value in [0.0, 1.0].
    """
    span = max_year - min_year
    if span == 0:
        return 0.5
    return round((max_year - year) / span, 4)


class GalaxySummary(BaseModel):
    language: str
    repo_count: int
    total_stars: int
    avg_habitability: float
    birth_year: int
    distance_from_center: float   # 0.0 = center (newest), 1.0 = outer rim (oldest)
    language_type: str | None     


@router.get("", response_model=list[GalaxySummary])
def list_languages(min_repos: int = Query(5, ge=1)):
    """
    Returns one entry per language (galaxy).
    Birth years come from the Kaggle programming languages dataset.
    """
    conn = get_connection()
    cur = conn.cursor()

    min_year, max_year = _get_year_bounds(cur)

    cur.execute("""
        SELECT
            r.language,
            COUNT(*)                    AS repo_count,
            SUM(r.github_stars)         AS total_stars,
            AVG(r.habitability_score)   AS avg_habitability,
            pl.appeared                 AS birth_year,
            pl.type                     AS language_type
        FROM repositories r
        LEFT JOIN programming_languages pl
            ON LOWER(r.language) = LOWER(pl.title)
        WHERE r.language IS NOT NULL
          AND r.enrichment_failed = 0
        GROUP BY r.language
        HAVING repo_count >= ?
        ORDER BY total_stars DESC
    """, (min_repos,))
    rows = cur.fetchall()
    conn.close()

    result = []
    for row in rows:
        year = row["birth_year"] or FALLBACK_YEAR
        result.append({
            "language":             row["language"],
            "repo_count":           row["repo_count"],
            "total_stars":          row["total_stars"] or 0,
            "avg_habitability":     round(row["avg_habitability"] or 0.0, 4),
            "birth_year":           year,
            "distance_from_center": year_to_distance(year, min_year, max_year),
            "language_type":        row["language_type"],
        })
    return result


@router.get("/{language}/repos", response_model=dict)
def repos_in_language(
    language: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    sort_by: str = Query("github_stars"),
):
    conn = get_connection()
    cur = conn.cursor()

    safe_sort = sort_by if sort_by in ("github_stars", "habitability_score", "trending_count") else "github_stars"
    offset = (page - 1) * page_size

    cur.execute(
        "SELECT COUNT(*) AS n FROM repositories WHERE language = ? AND enrichment_failed = 0",
        (language,),
    )
    total = cur.fetchone()["n"]

    cur.execute(
        f"""
        SELECT id, full_name, owner, name, description, language,
               github_stars, github_forks, habitability_score, star_type,
               trending_count, last_trending_date, is_archived
        FROM repositories
        WHERE language = ? AND enrichment_failed = 0
        ORDER BY {safe_sort} DESC
        LIMIT ? OFFSET ?
        """,
        (language, page_size, offset),
    )
    rows = cur.fetchall()
    conn.close()

    from api.routers.repositories import _row_to_summary
    return {
        "language": language,
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [_row_to_summary(r) for r in rows],
    }