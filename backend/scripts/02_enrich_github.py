"""
Enrich repositories via GitHub REST API
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
MAX_RETRIES = 3


# GitHub API client 
        
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

    def get(self, path: str) -> dict | None:
        """
        GET /path, handle rate-limits & errors.
        Returns parsed JSON dict, or None on non-recoverable error.
        """
        url = f"{GITHUB_API_BASE}{path}"
        self._wait_if_needed()

        for attempt in range(1, MAX_RETRIES + 1):
            req = urllib.request.Request(url, headers=self._headers())
            try:
                with urllib.request.urlopen(req, timeout=15) as resp:
                    # update rate-limit bookkeeping from response headers
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


# Data extraction                                                     

def extract_repo_data(api_data: dict) -> dict:
    """Map GitHub API response to our DB columns."""
    topics = json.dumps(api_data.get("topics") or [])
    license_name = None
    if lic := api_data.get("license"):
        license_name = lic.get("spdx_id") or lic.get("name")

    return {
        "description":   (api_data.get("description") or "")[:500],
        "language":      api_data.get("language"),
        "topics":        topics,
        "homepage":      (api_data.get("homepage") or "")[:300] or None,
        "license":       license_name,
        "github_stars":  api_data.get("stargazers_count", 0),
        "github_forks":  api_data.get("forks_count", 0),
        "open_issues":   api_data.get("open_issues_count", 0),
        "watchers":      api_data.get("watchers_count", 0),
        "created_at":    api_data.get("created_at"),
        "pushed_at":     api_data.get("pushed_at"),
        "is_archived":   int(api_data.get("archived", False)),
        "is_fork":       int(api_data.get("fork", False)),
        "enriched_at":   datetime.now(timezone.utc).isoformat(),
        "enrichment_failed": 0,
    }


# Main enrichment loop                                                

def enrich(limit: int | None = None, dry_run: bool = False):
    conn = get_connection()
    cur = conn.cursor()

    query = """
        SELECT id, full_name
        FROM repositories
        WHERE enriched_at IS NULL AND enrichment_failed = 0
        ORDER BY trending_count DESC   -- prioritise most-trended repos
    """
    if limit:
        query += f" LIMIT {limit}"

    cur.execute(query)
    repos = cur.fetchall()

    total = len(repos)
    print(f"Repos to enrich: {total:,}")
    if dry_run:
        print("(dry-run mode — no API calls made)")
        for r in repos[:20]:
            print(f"would fetch: {r['full_name']}")
        conn.close()
        return

    client = GitHubClient()
    enriched = 0
    failed = 0
    t0 = time.time()

    for i, repo in enumerate(repos, 1):
        full_name = repo["full_name"]
        api_data = client.get(f"/repos/{full_name}")

        if api_data is None:
            # mark as failed so we skip it on future runs
            cur.execute(
                "UPDATE repositories SET enrichment_failed = 1 WHERE id = ?",
                (repo["id"],),
            )
            failed += 1
        else:
            data = extract_repo_data(api_data)
            placeholders = ", ".join(f"{k} = :{k}" for k in data)
            cur.execute(
                f"UPDATE repositories SET {placeholders} WHERE id = :_id",
                {**data, "_id": repo["id"]},
            )
            enriched += 1

        # periodic commit
        if i % BATCH_COMMIT_SIZE == 0:
            conn.commit()
            elapsed = time.time() - t0
            rate = i / elapsed
            eta = (total - i) / rate if rate > 0 else 0
            print(
                f"   [{i:>{len(str(total))}}/{total}] "
                f"{enriched} enriched, {failed} failed | "
                f"{rate:.1f} req/s | ETA {eta/60:.1f} min | "
                f"API remaining: {client.remaining}"
            )

    conn.commit()
    conn.close()

    elapsed = time.time() - t0
    print(f"\n Enrichment done in {elapsed/60:.1f} min")
    print(f"Enriched : {enriched:,}")
    print(f"Failed   : {failed:,}  (deleted/renamed repos)")


# CLI                                                                 

def main():
    parser = argparse.ArgumentParser(description="Enrich repositories via GitHub API")
    parser.add_argument("--limit", type=int, default=None,
                        help="Max number of repos to enrich in this run")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print what would be fetched without making API calls")
    args = parser.parse_args()
    enrich(limit=args.limit, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
