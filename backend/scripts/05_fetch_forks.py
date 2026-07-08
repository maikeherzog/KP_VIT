"""
Fetch top forks ("planets") for each repository via GitHub REST API

For every repo that has forks_count > 0, this pulls the top N forks
(sorted by stargazers) via GET /repos/{owner}/{repo}/forks?sort=stargazers
and stores them in a new `forks` table.
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import urllib.request
import urllib.error

sys.path.insert(0, str(Path(__file__).parent.parent))
from database import get_connection

# Config

GITHUB_API_BASE = "https://api.github.com"
BATCH_COMMIT_SIZE = 50          # commit DB every N repos
RETRY_WAIT_SECONDS = 60         # wait time when secondary rate-limit hit
MAX_RETRIES = 3                 # GitHub's 500/502 on huge repos is intermittent,
                                 # not structural — more attempts genuinely help
TOP_N_FORKS = 5                 # how many forks to keep per repo


# GitHub API client (same behaviour as 02_enrich_github.py)

class GitHubClient:
    def __init__(self, token: str | None = None):
        self.token = token or os.environ.get("GITHUB_TOKEN")
        self.remaining = 5000
        self.reset_at = 0

        if not self.token:
            print("No GITHUB_TOKEN set. Using unauthenticated API.")

    def _headers(self) -> dict:
        h = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "habitable-worlds-enrichment/1.0",
        }
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        return h

    def _wait_if_needed(self):
        if self.remaining <= 10:
            now = time.time()
            wait = max(0, self.reset_at - now) + 5
            print(f"Rate limit nearly exhausted — sleeping {wait:.0f}s …")
            time.sleep(wait)

    def get(self, path: str) -> list | dict | None:
        """
        GET /path, handle rate-limits & errors.
        Returns parsed JSON (list or dict), or None on non-recoverable error.
        """
        url = f"{GITHUB_API_BASE}{path}"
        self._wait_if_needed()

        for attempt in range(1, MAX_RETRIES + 1):
            req = urllib.request.Request(url, headers=self._headers())
            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    self.remaining = int(resp.headers.get("X-RateLimit-Remaining", self.remaining))
                    self.reset_at = int(resp.headers.get("X-RateLimit-Reset", self.reset_at))
                    return json.loads(resp.read().decode())

            except urllib.error.HTTPError as e:
                if e.code == 404:
                    return None
                if e.code in (403, 429):
                    retry_after = int(e.headers.get("Retry-After", RETRY_WAIT_SECONDS))
                    print(f"Secondary rate limit (attempt {attempt}/{MAX_RETRIES}) — "
                          f"sleeping {retry_after}s …")
                    time.sleep(retry_after)
                    continue
                if e.code >= 500:
                    print(f"GitHub server error {e.code} for {url} (attempt {attempt})")
                    time.sleep(5 * attempt)
                    continue
                print(f"HTTP {e.code} for {url}")
                return None

            except Exception as exc:
                print(f"Network error ({exc}) for {url} (attempt {attempt})")
                time.sleep(5 * attempt)

        return None

    def get_forks(self, full_name: str) -> list | None:
        """
        Fetch the top N forks (by stars) for a repo.
        sort=stargazers forces GitHub to sort the *entire* fork list
        server-side, which 500s/502s on repos with huge fork counts.
        For the vast majority of repos this works fine and gives correct
        star counts. Only if it fails do we fall back to an unsorted
        request (newest-first) — that avoids the crash but the returned
        forks will typically show 0 stars, since brand-new forks rarely
        have any yet.
        """
        forks = self.get(f"/repos/{full_name}/forks?sort=stargazers&per_page={TOP_N_FORKS}")
        if forks is not None:
            return forks

        print(f"   sorted fork lookup failed for {full_name} — falling back to "
              f"unsorted (forks will likely show 0 stars) …")
        return self.get(f"/repos/{full_name}/forks?per_page={TOP_N_FORKS}")


# DB setup

def ensure_forks_table(conn):
    """Create the forks table if it doesn't exist yet, and migrate older
    versions that predate the `success` column."""
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


SENTINEL_FORK_NAME = "__FETCH_FAILED__"  # marks a repo whose forks couldn't be fetched


def mark_fork_fetch_failed(cur, repo_id: int, fetched_at: str):
    """
    Insert a sentinel row (success=0) so this repo is skipped on normal runs
    but stays discoverable for a deliberate --retry-failed run.
    GitHub's /forks endpoint intermittently 500s/502s on repos with huge fork
    counts — it's not a permanent condition, so we don't want to block these
    repos forever, just avoid re-attempting them on every ordinary run.
    """
    cur.execute(
        """
        INSERT OR REPLACE INTO forks
            (repo_id, fork_owner, fork_name, fork_full_name, fork_stars, success, fetched_at)
        VALUES (?, '', '', ?, 0, 0, ?)
        """,
        (repo_id, SENTINEL_FORK_NAME, fetched_at),
    )


# Data extraction

def extract_fork_rows(repo_id: int, forks_json: list, fetched_at: str) -> list[tuple]:
    """
    Map raw GitHub fork list to DB rows.
    Normally forks_json already comes sorted by stars (sort=stargazers),
    so this is mostly a safety net — it matters for the rare fallback
    case where we had to fetch unsorted.
    """
    forks_sorted = sorted(
        forks_json,
        key=lambda f: f.get("stargazers_count", 0),
        reverse=True,
    )[:TOP_N_FORKS]

    rows = []
    for f in forks_sorted:
        owner = (f.get("owner") or {}).get("login", "")
        rows.append((
            repo_id,
            owner,
            f.get("name", ""),
            f.get("full_name", ""),
            f.get("stargazers_count", 0),
            1,  # success
            fetched_at,
        ))
    return rows


# Main fetch loop

def fetch_forks(limit: int | None = None, dry_run: bool = False, min_forks: int = 1,
                 retry_failed: bool = False):
    conn = get_connection()
    ensure_forks_table(conn)
    cur = conn.cursor()

    if retry_failed:
        query = """
            SELECT r.id, r.full_name, r.github_forks
            FROM repositories r
            JOIN forks f ON f.repo_id = r.id AND f.success = 0
            ORDER BY r.trending_count DESC
        """
        params = []
    else:
        query = """
            SELECT id, full_name, github_forks
            FROM repositories
            WHERE enriched_at IS NOT NULL
              AND github_forks >= ?
              AND id NOT IN (SELECT DISTINCT repo_id FROM forks)
            ORDER BY trending_count DESC
        """
        params = [min_forks]

    if limit:
        query += " LIMIT ?"
        params.append(limit)

    cur.execute(query, params)
    repos = cur.fetchall()

    total = len(repos)
    print(f"Repos to fetch forks for: {total:,}")
    if dry_run:
        print("(dry-run mode — no API calls made)")
        for r in repos[:20]:
            print(f"would fetch forks for: {r['full_name']} ({r['github_forks']} forks)")
        conn.close()
        return

    client = GitHubClient()
    fetched = 0
    failed = 0
    total_forks_saved = 0
    t0 = time.time()

    for i, repo in enumerate(repos, 1):
        full_name = repo["full_name"]
        forks_json = client.get_forks(full_name)

        if forks_json is None:
            failed += 1
            mark_fork_fetch_failed(cur, repo["id"], datetime.now(timezone.utc).isoformat())
        else:
            fetched_at = datetime.now(timezone.utc).isoformat()
            cur.execute(
                "DELETE FROM forks WHERE repo_id = ? AND fork_full_name = ?",
                (repo["id"], SENTINEL_FORK_NAME),
            )
            rows = extract_fork_rows(repo["id"], forks_json, fetched_at)
            if rows:
                cur.executemany(
                    """
                    INSERT OR REPLACE INTO forks
                        (repo_id, fork_owner, fork_name, fork_full_name, fork_stars, success, fetched_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    rows,
                )
                total_forks_saved += len(rows)
            fetched += 1

        if i % BATCH_COMMIT_SIZE == 0:
            conn.commit()
            elapsed = time.time() - t0
            rate = i / elapsed
            eta = (total - i) / rate if rate > 0 else 0
            print(
                f"   [{i:>{len(str(total))}}/{total}] "
                f"{fetched} fetched, {failed} failed, {total_forks_saved} forks saved | "
                f"{rate:.1f} req/s | ETA {eta/60:.1f} min | "
                f"API remaining: {client.remaining}"
            )

    conn.commit()
    conn.close()

    elapsed = time.time() - t0
    print(f"\n Fork fetch done in {elapsed/60:.1f} min")
    print(f"Repos fetched : {fetched:,}")
    print(f"Failed        : {failed:,}")
    print(f"Forks saved   : {total_forks_saved:,}")


# CLI

def main():
    parser = argparse.ArgumentParser(description="Fetch top forks per repository via GitHub API")
    parser.add_argument("--limit", type=int, default=None,
                        help="Max number of repos to process in this run")
    parser.add_argument("--min-forks", type=int, default=1,
                        help="Only process repos with at least this many forks (default: 1)")
    parser.add_argument("--retry-failed", action="store_true",
                        help="Only re-attempt repos whose fork fetch previously failed")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print what would be fetched without making API calls")
    args = parser.parse_args()
    fetch_forks(limit=args.limit, dry_run=args.dry_run, min_forks=args.min_forks,
                retry_failed=args.retry_failed)


if __name__ == "__main__":
    main()