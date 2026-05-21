"""
Import HuggingFace dataset into SQLite
"""

import argparse
import csv
import io
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from database import get_connection, init_db


BATCH_SIZE = 1000  # rows per DB transaction


def parse_date(raw: str) -> str | None:
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d.%m.%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(raw.strip(), fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return raw.strip() or None


def parse_int(raw: str) -> int:
    try:
        return int(str(raw).replace(",", "").replace(" ", "").strip())
    except (ValueError, TypeError):
        return 0


def upsert_repo(cur, owner: str, name: str) -> int:
    """
    Insert a repo if it doesn't exist yet, return its id.
    Uses INSERT OR IGNORE so we don't overwrite enriched data.
    """
    full_name = f"{owner}/{name}"
    cur.execute(
        """
        INSERT OR IGNORE INTO repositories (owner, name, full_name)
        VALUES (?, ?, ?)
        """,
        (owner, name, full_name),
    )
    cur.execute("SELECT id FROM repositories WHERE full_name = ?", (full_name,))
    row = cur.fetchone()
    return row["id"]



COLUMN_ALIASES = {
    # date
    "date": "date",
    "trending_date": "date",
    "snapshot_date": "date",
    # rank
    "rank": "ranking",
    "ranking": "ranking",
    "position": "ranking",
    # owner / user
    "username": "owner",
    "user": "owner",
    "owner": "owner",
    "author": "owner",
    "repo_owner": "owner",
    # repo name
    "repositoryname": "repo_name",
    "repository_name": "repo_name",
    "repo": "repo_name",
    "repo_name": "repo_name",
    "name": "repo_name",
    # stars
    "stars": "stars",
    "star_count": "stars",
    "stargazers": "stars",
}


def normalise_headers(headers: list[str]) -> list[str]:
    lowered = [h.lower().strip().replace(" ", "_") for h in headers]
    return [COLUMN_ALIASES.get(h, h) for h in lowered]


# Core import logic                                                    
def import_csv(csv_path: Path):
    print(f"Reading {csv_path} …")
    conn = get_connection()
    cur = conn.cursor()

    repo_cache: dict[str, int] = {}   
    history_batch: list[tuple] = []
    total_rows = 0
    skipped = 0

    with open(csv_path, encoding="utf-8", errors="replace") as fh:
        reader = csv.DictReader(fh)
        if reader.fieldnames is None:
            print("CSV appears to have no header row.")
            return

        # normalise column names once
        reader.fieldnames = normalise_headers(list(reader.fieldnames))

        required = {"date", "owner", "repo_name"}
        missing = required - set(reader.fieldnames)
        if missing:
            print(f"Missing required columns after normalisation: {missing}")
            print(f"Found columns: {reader.fieldnames}")
            return

        print(f"Columns mapped: {reader.fieldnames}")
        t0 = time.time()

        for row in reader:
            total_rows += 1

            owner = (row.get("owner") or "").strip()
            repo_name = (row.get("repo_name") or "").strip()
            if not owner or not repo_name:
                skipped += 1
                continue

            full_name = f"{owner}/{repo_name}"
            date = parse_date(row.get("date") or "")
            ranking = parse_int(row.get("ranking") or "0") or None
            stars = parse_int(row.get("stars") or "0")

            # get or create repo row
            if full_name not in repo_cache:
                repo_cache[full_name] = upsert_repo(cur, owner, repo_name)

            repo_id = repo_cache[full_name]
            history_batch.append((repo_id, date, ranking, stars))

            # flush batch
            if len(history_batch) >= BATCH_SIZE:
                _flush_history(cur, history_batch)
                history_batch.clear()
                conn.commit()

                if total_rows % 50_000 == 0:
                    elapsed = time.time() - t0
                    print(f"   … {total_rows:,} rows | {len(repo_cache):,} unique repos | {elapsed:.1f}s")

        # final flush
        if history_batch:
            _flush_history(cur, history_batch)
        conn.commit()

    # ---- aggregate trending stats per repo ----
    print("Aggregating trending statistics …")
    _aggregate_trending(cur)
    conn.commit()
    conn.close()

    elapsed = time.time() - t0
    print(f"\n Import complete in {elapsed:.1f}s")
    print(f"Total rows processed : {total_rows:,}")
    print(f"Skipped (bad data)   : {skipped:,}")
    print(f"Unique repositories  : {len(repo_cache):,}")


def _flush_history(cur, batch: list[tuple]):
    cur.executemany(
        """
        INSERT INTO trending_history (repo_id, date, ranking, star_count)
        VALUES (?, ?, ?, ?)
        """,
        batch,
    )


def _aggregate_trending(cur):
    """
    Update each repository row with aggregate stats derived from
    trending_history. Run after all history rows are inserted.
    """
    cur.execute("""
        UPDATE repositories
        SET
            trending_count      = agg.cnt,
            first_trending_date = agg.first_date,
            last_trending_date  = agg.last_date,
            best_ranking        = agg.best_rank,
            peak_stars          = agg.peak_stars
        FROM (
            SELECT
                repo_id,
                COUNT(*)        AS cnt,
                MIN(date)       AS first_date,
                MAX(date)       AS last_date,
                MIN(ranking)    AS best_rank,
                MAX(star_count) AS peak_stars
            FROM trending_history
            GROUP BY repo_id
        ) AS agg
        WHERE repositories.id = agg.repo_id
    """)


# HuggingFace download                                     

def download_from_huggingface() -> Path:
    
    try:
        from datasets import load_dataset  # type: ignore
    except ImportError:
        print("'datasets' library not found. Run: pip install datasets")
        sys.exit(1)

    out_path = Path(__file__).parent.parent / "data" / "raw_trending.csv"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    print("⬇Downloading dataset from HuggingFace (this may take a while) …")
    ds = load_dataset("ronantakizawa/github-top-projects", split="train")
    ds.to_csv(str(out_path))
    print(f"Saved to {out_path}")
    return out_path


# CLI                                                                

def main():
    parser = argparse.ArgumentParser(description="Import HuggingFace GitHub trending dataset into SQLite")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--csv", metavar="PATH", help="Path to a local CSV file")
    group.add_argument("--hf", action="store_true", help="Download fresh from HuggingFace")
    args = parser.parse_args()

    init_db()

    if args.hf:
        csv_path = download_from_huggingface()
    elif args.csv:
        csv_path = Path(args.csv)
        if not csv_path.exists():
            print(f"File not found: {csv_path}")
            sys.exit(1)
    else:
        # look for a default location
        default = Path(__file__).parent.parent / "data" / "raw_trending.csv"
        if default.exists():
            csv_path = default
        else:
            print("No CSV found. Use --csv PATH or --hf to download.")
            parser.print_help()
            sys.exit(1)

    import_csv(csv_path)


if __name__ == "__main__":
    main()
