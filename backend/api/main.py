"""
FastAPI Backend
"""
import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routers import repositories, languages

sys.path.insert(0, str(Path(__file__).parent.parent))
from database import get_connection

app = FastAPI(
    title="Habitable Worlds API",
    description="Backend for the GitHub-as-Universe data storytelling app",
    version="1.0.0",
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers                                                            
app.include_router(repositories.router, prefix="/repos",     tags=["Repositories"])
app.include_router(languages.router,    prefix="/languages", tags=["Languages / Galaxies"])

@app.get("/health", tags=["Meta"])
def health():
    return {"status": "ok"}

@app.get("/stats", tags=["Meta"])
def stats():
    """Overall dataset stats — repo/language counts, total stars, star_type distribution."""
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) AS n FROM repositories WHERE enrichment_failed = 0")
    total_repos = cur.fetchone()["n"]

    cur.execute("""
        SELECT COUNT(DISTINCT language) AS n
        FROM repositories
        WHERE language IS NOT NULL AND enrichment_failed = 0
    """)
    total_languages = cur.fetchone()["n"]

    cur.execute("SELECT SUM(github_stars) AS n FROM repositories WHERE enrichment_failed = 0")
    total_stars = cur.fetchone()["n"] or 0

    cur.execute("""
        SELECT star_type, COUNT(*) AS n, ROUND(AVG(habitability_score), 3) AS avg_score
        FROM repositories
        WHERE enrichment_failed = 0
        GROUP BY star_type
    """)
    star_type_distribution = {
        row["star_type"]: {"count": row["n"], "avg_habitability_score": row["avg_score"]}
        for row in cur.fetchall()
    }

    conn.close()
    return {
        "total_repos": total_repos,
        "total_languages": total_languages,
        "total_stars": total_stars,
        "star_type_distribution": star_type_distribution,
    }
