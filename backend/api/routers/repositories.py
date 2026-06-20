"""
/repos endpoints
================
GET /repos                  — paginated list with filters
GET /repos/search?q=...     — full-text search by name/description
GET /repos/{owner}/{name}   — single repo detail
GET /repos/{owner}/{name}/history — trending history timeseries
"""

import json
from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from database import get_connection

router = APIRouter()


class RepoSummary(BaseModel):
    id: int
    full_name: str
    owner: str
    name: str
    description: str | None
    language: str | None
    github_stars: int
    github_forks: int
    habitability_score: float
    star_type: str
    trending_count: int
    last_trending_date: str | None
    is_archived: bool


class RepoDetail(RepoSummary):
    topics: list[str]
    homepage: str | None
    license: str | None
    open_issues: int
    created_at: str | None
    pushed_at: str | None
    peak_stars: int
    best_ranking: int | None
    first_trending_date: str | None
    narration_text: str | None


class TrendingPoint(BaseModel):
    date: str
    ranking: int | None
    star_count: int



def _row_to_summary(row) -> dict:
    return {
        "id":                  row["id"],
        "full_name":           row["full_name"],
        "owner":               row["owner"],
        "name":                row["name"],
        "description":         row["description"],
        "language":            row["language"],
        "github_stars":        row["github_stars"] or 0,
        "github_forks":        row["github_forks"] or 0,
        "habitability_score":  round(row["habitability_score"] or 0.0, 4),
        "star_type":           row["star_type"] or "main_sequence",
        "trending_count":      row["trending_count"] or 0,
        "last_trending_date":  row["last_trending_date"],
        "is_archived":         bool(row["is_archived"]),
    }


def _row_to_detail(row) -> dict:
    d = _row_to_summary(row)
    topics_raw = row["topics"] or "[]"
    try:
        topics = json.loads(topics_raw)
    except Exception:
        topics = []
    d.update({
        "topics":              topics,
        "homepage":            row["homepage"],
        "license":             row["license"],
        "open_issues":         row["open_issues"] or 0,
        "created_at":          row["created_at"],
        "pushed_at":           row["pushed_at"],
        "peak_stars":          row["peak_stars"] or 0,
        "best_ranking":        row["best_ranking"],
        "first_trending_date": row["first_trending_date"],
        "narration_text":      row["narration_text"],
    })
    return d


# Endpoints                                                           

@router.get("", response_model=dict)
def list_repos(
    language: str | None = Query(None, description="Filter by programming language"),
    star_type: Literal["main_sequence", "red_giant", "white_dwarf", "black_hole"] | None = Query(None),
    min_stars: int = Query(0, ge=0),
    min_habitability: float = Query(0.0, ge=0.0, le=1.0),
    sort_by: Literal["habitability_score", "github_stars", "trending_count"] = "habitability_score",
    order: Literal["asc", "desc"] = "desc",
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    
    conn = get_connection()
    cur = conn.cursor()

    conditions = ["enrichment_failed = 0"]
    params: list = []

    if language:
        conditions.append("language = ?")
        params.append(language)
    if star_type:
        conditions.append("star_type = ?")
        params.append(star_type)
    if min_stars:
        conditions.append("github_stars >= ?")
        params.append(min_stars)
    if min_habitability:
        conditions.append("habitability_score >= ?")
        params.append(min_habitability)

    where = "WHERE " + " AND ".join(conditions)
    order_clause = f"ORDER BY {sort_by} {order.upper()}"
    offset = (page - 1) * page_size

    cur.execute(f"SELECT COUNT(*) AS n FROM repositories {where}", params)
    total = cur.fetchone()["n"]

    cur.execute(
        f"""
        SELECT id, full_name, owner, name, description, language,
               github_stars, github_forks, habitability_score, star_type,
               trending_count, last_trending_date, is_archived
        FROM repositories
        {where}
        {order_clause}
        LIMIT ? OFFSET ?
        """,
        params + [page_size, offset],
    )
    rows = cur.fetchall()
    conn.close()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [_row_to_summary(r) for r in rows],
    }


@router.get("/search", response_model=dict)
def search_repos(
    q: str = Query(..., min_length=1, description="Search query (name or description)"),
    limit: int = Query(20, ge=1, le=100),
):
    conn = get_connection()
    cur = conn.cursor()
    pattern = f"%{q}%"
    cur.execute(
        """
        SELECT id, full_name, owner, name, description, language,
               github_stars, github_forks, habitability_score, star_type,
               trending_count, last_trending_date, is_archived
        FROM repositories
        WHERE (name LIKE ? OR full_name LIKE ? OR description LIKE ?)
          AND enrichment_failed = 0
        ORDER BY github_stars DESC
        LIMIT ?
        """,
        (pattern, pattern, pattern, limit),
    )
    rows = cur.fetchall()
    conn.close()
    return {"items": [_row_to_summary(r) for r in rows]}


@router.get("/{owner}/{name}", response_model=RepoDetail)
def get_repo(owner: str, name: str):
    """Full detail for a single repository — shown in the info panel."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT * FROM repositories WHERE full_name = ?",
        (f"{owner}/{name}",),
    )
    row = cur.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Repository not found")
    return _row_to_detail(row)


@router.get("/{owner}/{name}/history", response_model=list[TrendingPoint])
def get_repo_history(owner: str, name: str):
    """Trending history timeseries for the detail chart."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT id FROM repositories WHERE full_name = ?", (f"{owner}/{name}",))
    repo = cur.fetchone()
    if not repo:
        conn.close()
        raise HTTPException(status_code=404, detail="Repository not found")

    cur.execute(
        """
        SELECT date, ranking, star_count
        FROM trending_history
        WHERE repo_id = ?
        ORDER BY date ASC
        """,
        (repo["id"],),
    )
    rows = cur.fetchall()
    conn.close()
    return [{"date": r["date"], "ranking": r["ranking"], "star_count": r["star_count"]} for r in rows]
