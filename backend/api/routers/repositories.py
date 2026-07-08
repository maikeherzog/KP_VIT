"""
/repos endpoints
================
GET /repos                  — paginated list with filters
GET /repos/search?q=...     — full-text search by name/description
GET /repos/{owner}/{name}   — single repo detail
GET /repos/{owner}/{name}/history — trending history timeseries
"""

import json
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from database import get_connection

router = APIRouter()

class Planet(BaseModel):
    id: str          # "owner/name"
    name: str
    owner: str
    stars: int

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
    planets: list[Planet]


class TrendingPoint(BaseModel):
    date: str
    ranking: int | None
    star_count: int

class UniverseRepo(BaseModel):
    """Same shape as in repos.db.json entries"""
    id: str            # full_name
    owner: str
    name: str
    fullName: str
    language: str | None
    stars: int
    forks: int
    activity: float     # == habitability_score
    habitable: bool
    born: int | None
    planets: list[Planet]
    fetchedAt: str | None



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

_FORK_SENTINELS = ("__NO_FORKS__", "__FETCH_FAILED__")

def _get_planets(cur, repo_id: int) -> list[dict]:
    cur.execute(
        f"""
        SELECT fork_full_name AS id, fork_name AS name,
               fork_owner AS owner, fork_stars AS stars
        FROM forks
        WHERE repo_id = ?
          AND fork_full_name NOT IN ({",".join("?" * len(_FORK_SENTINELS))})
        ORDER BY fork_stars DESC
        """,
        (repo_id, *_FORK_SENTINELS),
    )
    return [dict(r) for r in cur.fetchall()]

def _get_planets_batch(cur, repo_ids: list[int]) -> dict[int, list[dict]]:
    """Same as _get_planets but for many repos in one query (avoids N+1
    queries when exporting large lists)."""
    if not repo_ids:
        return {}
    id_placeholders = ",".join("?" * len(repo_ids))
    sentinel_placeholders = ",".join("?" * len(_FORK_SENTINELS))
    cur.execute(
        f"""
        SELECT repo_id, fork_full_name AS id, fork_name AS name,
               fork_owner AS owner, fork_stars AS stars
        FROM forks
        WHERE repo_id IN ({id_placeholders})
          AND fork_full_name NOT IN ({sentinel_placeholders})
        ORDER BY fork_stars DESC
        """,
        (*repo_ids, *_FORK_SENTINELS),
    )
    result: dict[int, list[dict]] = {rid: [] for rid in repo_ids}
    for r in cur.fetchall():
        result[r["repo_id"]].append(
            {"id": r["id"], "name": r["name"], "owner": r["owner"], "stars": r["stars"]}
        )
    return result


def _compute_habitable(pushed_at: str | None, is_archived) -> bool:
    """pushed within the last year and not archived"""
    if is_archived or not pushed_at:
        return False
    try:
        pushed = datetime.fromisoformat(pushed_at.replace("Z", "+00:00"))
    except ValueError:
        return False
    return (datetime.now(timezone.utc) - pushed).days < 365

def _extract_born(created_at: str | None) -> int | None:
    if not created_at:
        return None
    try:
        return int(created_at[:4])
    except (ValueError, TypeError):
        return None

def _row_to_universe(row, planets: list[dict]) -> dict:
    return {
        "id":         row["full_name"],
        "owner":      row["owner"],
        "name":       row["name"],
        "fullName":   row["full_name"],
        "language":   row["language"],
        "stars":      row["github_stars"] or 0,
        "forks":      row["github_forks"] or 0,
        "activity":   round(row["habitability_score"] or 0.0, 3),
        "habitable":  _compute_habitable(row["pushed_at"], row["is_archived"]),
        "born":       _extract_born(row["created_at"]),
        "planets":    planets,
        "fetchedAt":  row["enriched_at"],
    }
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


@router.get("/universe", response_model=dict)
def export_universe(
    language: str | None = Query(None, description="Filter by programming language"),
    min_stars: int = Query(0, ge=0),
    page: int = Query(1, ge=1),
    page_size: int = Query(500, ge=1, le=5000),
):
    
    conn = get_connection()
    cur = conn.cursor()
 
    conditions = ["enrichment_failed = 0"]
    params: list = []
    if language:
        conditions.append("language = ?")
        params.append(language)
    if min_stars:
        conditions.append("github_stars >= ?")
        params.append(min_stars)
    where = "WHERE " + " AND ".join(conditions)
    offset = (page - 1) * page_size
 
    cur.execute(f"SELECT COUNT(*) AS n FROM repositories {where}", params)
    total = cur.fetchone()["n"]
 
    cur.execute(
        f"""
        SELECT * FROM repositories
        {where}
        ORDER BY github_stars DESC
        LIMIT ? OFFSET ?
        """,
        params + [page_size, offset],
    )
    rows = cur.fetchall()
 
    planets_map = _get_planets_batch(cur, [r["id"] for r in rows])
    conn.close()
 
    items = [_row_to_universe(r, planets_map.get(r["id"], [])) for r in rows]
    return {"total": total, "page": page, "page_size": page_size, "items": items}


@router.get("/{owner}/{name}/universe", response_model=UniverseRepo)
def get_repo_universe(owner: str, name: str):
    """Single repo repos.db.json shape"""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM repositories WHERE full_name = ?", (f"{owner}/{name}",))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Repository not found")
 
    planets = _get_planets(cur, row["id"])
    conn.close()
    return _row_to_universe(row, planets)

@router.get("/random", response_model=RepoSummary)
def random_repo(
    language: str | None = Query(None, description="Filter by programming language"),
    star_type: Literal["main_sequence", "red_giant", "white_dwarf", "black_hole"] | None = Query(None),
    min_stars: int = Query(0, ge=0),
):
    """A single random repo — for 'surprise me' exploration."""
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
    where = "WHERE " + " AND ".join(conditions)
 
    cur.execute(
        f"""
        SELECT id, full_name, owner, name, description, language,
               github_stars, github_forks, habitability_score, star_type,
               trending_count, last_trending_date, is_archived
        FROM repositories
        {where}
        ORDER BY RANDOM()
        LIMIT 1
        """,
        params,
    )
    row = cur.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="No repository matches those filters")
    return _row_to_summary(row)
 

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


@router.get("/{owner}/{name}/similar", response_model=list[RepoSummary])
def similar_repos(owner: str, name: str, limit: int = Query(6, ge=1, le=20)):
    """
    Repos 'nearby in the same galaxy': same language, roughly similar star
    count (0.2x–5x), closest stars first. Excludes the repo itself.
    """
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM repositories WHERE full_name = ?", (f"{owner}/{name}",))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Repository not found")
 
    language = row["language"]
    stars = row["github_stars"] or 0
    lo = max(1, int(stars * 0.2))
    hi = max(stars * 5, stars + 100)
 
    cur.execute(
        """
        SELECT id, full_name, owner, name, description, language,
               github_stars, github_forks, habitability_score, star_type,
               trending_count, last_trending_date, is_archived
        FROM repositories
        WHERE language = ? AND id != ? AND enrichment_failed = 0
          AND github_stars BETWEEN ? AND ?
        ORDER BY ABS(github_stars - ?) ASC
        LIMIT ?
        """,
        (language, row["id"], lo, hi, stars, limit),
    )
    rows = cur.fetchall()
    conn.close()
    return [_row_to_summary(r) for r in rows]
    

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
