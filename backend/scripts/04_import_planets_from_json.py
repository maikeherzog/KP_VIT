"""
Import forks ("planets") from a colleague's repos.db.json into our DB

Instead of re-fetching forks ourselves via the GitHub API (slow, and some
huge repos intermittently 500), this reads an already-fetched JSON database
(the raw {updatedAt, repos: {"owner/name": {...}}} structure produced by
scripts/enrich.mjs fetch) and copies its `planets` straight into our
`forks` table.

Expected shape per repo entry (only `planets` / `forksFailed` are used):
{
  "owner/name": {
    "fullName": "owner/name",
    "forks": 3063,
    "planets": [
      {"id": "user/repo", "name": "repo", "owner": "user", "stars": 11}
    ],
    "forksFailed": false   # optional, present when the fork fetch failed
  }
}

Matching: repos are matched to our `repositories` table by full_name
(case-insensitive). Repos we don't have locally are skipped and counted.
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from database import get_connection

BATCH_COMMIT_SIZE = 200
SENTINEL_FAILED   = "__FETCH_FAILED__"  # forks fetch failed (retriable, success=0)
SENTINEL_NO_FORKS = "__NO_FORKS__"      # genuinely has zero forks (success=1)


# DB setup (same table/shape as 04_fetch_forks.py)

def ensure_forks_table(conn):
    conn.execute("""
        CREATE TABLE IF NOT EXISTS forks (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            repo_id         INTEGER NOT NULL REFERENCES repositories(id),
            fork_owner      TEXT NOT NULL,
            fork_name       TEXT NOT NULL,
            fork_full_name  TEXT NOT NULL,
            fork_stars      INTEGER NOT NULL DEFAULT 0,
            success         INTEGER NOT NULL DEFAULT 1,
            fetched_at      TEXT NOT NULL,
            UNIQUE(repo_id, fork_full_name)
        )
    """)
    try:
        conn.execute("ALTER TABLE forks ADD COLUMN success INTEGER NOT NULL DEFAULT 1")
    except Exception:
        pass  # column already exists
    conn.commit()


def load_local_repo_ids(cur) -> dict[str, int]:
    """full_name.lower() -> id, for matching against the JSON."""
    cur.execute("SELECT id, full_name FROM repositories")
    return {row["full_name"].lower(): row["id"] for row in cur.fetchall()}


def load_repos_json(json_path: Path) -> dict:
    with open(json_path, encoding="utf-8") as fh:
        data = json.load(fh)
    # accept either {"repos": {...}} or a bare {"owner/name": {...}} dict
    return data.get("repos", data) if isinstance(data, dict) else {}


# Import logic

def import_planets(json_path: Path, overwrite: bool = False, dry_run: bool = False):
    print(f"Reading {json_path} …")
    source_repos = load_repos_json(json_path)
    print(f"Repos in JSON: {len(source_repos):,}")

    conn = get_connection()
    ensure_forks_table(conn)
    cur = conn.cursor()

    local_ids = load_local_repo_ids(cur)
    print(f"Repos in local DB: {len(local_ids):,}")

    cur.execute("SELECT DISTINCT repo_id FROM forks")
    already_have = {row["repo_id"] for row in cur.fetchall()}

    matched = 0
    unmatched = 0
    skipped_existing = 0
    planets_imported = 0
    marked_failed = 0
    marked_no_forks = 0
    i = 0

    for full_name, entry in source_repos.items():
        full_name = (entry.get("fullName") or full_name or "").strip()
        if not full_name:
            continue

        repo_id = local_ids.get(full_name.lower())
        if repo_id is None:
            unmatched += 1
            continue
        matched += 1

        if not overwrite and repo_id in already_have:
            skipped_existing += 1
            continue

        i += 1
        fetched_at = entry.get("fetchedAt") or datetime.now(timezone.utc).isoformat()

        if dry_run:
            continue

        if overwrite:
            cur.execute("DELETE FROM forks WHERE repo_id = ?", (repo_id,))

        if entry.get("forksFailed"):
            cur.execute(
                """
                INSERT OR REPLACE INTO forks
                    (repo_id, fork_owner, fork_name, fork_full_name, fork_stars, success, fetched_at)
                VALUES (?, '', '', ?, 0, 0, ?)
                """,
                (repo_id, SENTINEL_FAILED, fetched_at),
            )
            marked_failed += 1

        else:
            planets = entry.get("planets") or []
            if not planets:
                cur.execute(
                    """
                    INSERT OR REPLACE INTO forks
                        (repo_id, fork_owner, fork_name, fork_full_name, fork_stars, success, fetched_at)
                    VALUES (?, '', '', ?, 0, 1, ?)
                    """,
                    (repo_id, SENTINEL_NO_FORKS, fetched_at),
                )
                marked_no_forks += 1
            else:
                rows = [
                    (
                        repo_id,
                        p.get("owner", ""),
                        p.get("name", ""),
                        p.get("id", ""),  # "owner/name" in the source JSON
                        p.get("stars", 0),
                        1,
                        fetched_at,
                    )
                    for p in planets
                ]
                cur.executemany(
                    """
                    INSERT OR REPLACE INTO forks
                        (repo_id, fork_owner, fork_name, fork_full_name, fork_stars, success, fetched_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    rows,
                )
                planets_imported += len(rows)

        if i % BATCH_COMMIT_SIZE == 0:
            conn.commit()
            print(f"   … {i:,} repos imported so far")

    if dry_run:
        print("\n(dry-run — nothing written)")
    else:
        conn.commit()
    conn.close()

    print(f"\n Import summary")
    print(f"Matched to local DB   : {matched:,}")
    print(f"Not found locally     : {unmatched:,}  (in JSON but not in your repositories table)")
    print(f"Already had forks data: {skipped_existing:,}  (skipped — use --overwrite to replace)")
    print(f"Planets imported      : {planets_imported:,}")
    print(f"Marked as no-forks    : {marked_no_forks:,}")
    print(f"Marked as failed      : {marked_failed:,}  (retriable later, e.g. via your own fetch script)")


# CLI

def main():
    parser = argparse.ArgumentParser(
        description="Import planets/forks from a colleague's repos.db.json"
    )
    parser.add_argument("json_path", metavar="PATH",
                        help="Path to repos.db.json")
    parser.add_argument("--overwrite", action="store_true",
                        help="Replace forks data for repos that already have some")
    parser.add_argument("--dry-run", action="store_true",
                        help="Only report matches/mismatches, write nothing")
    args = parser.parse_args()

    json_path = Path(args.json_path)
    if not json_path.exists():
        print(f"File not found: {json_path}")
        sys.exit(1)

    import_planets(json_path, overwrite=args.overwrite, dry_run=args.dry_run)


if __name__ == "__main__":
    main()