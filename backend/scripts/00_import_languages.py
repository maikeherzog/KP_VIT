"""
Import Kaggle Programming Languages Dataset

Reads programming_languages_data.csv and populates the programming_languages table in SQLite.
"""

import argparse
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from database import get_connection, init_db

DEFAULT_CSV = Path(__file__).parent.parent / "data" / "programming_languages_data.csv"


def parse_int(val: str) -> int | None:
    try:
        return int(str(val).strip())
    except (ValueError, TypeError):
        return None


def import_languages(csv_path: Path):
    print(f"Reading {csv_path} …")

    conn = get_connection()
    cur = conn.cursor()

    cur.execute("DELETE FROM programming_languages")

    inserted = 0
    skipped = 0

    with open(csv_path, encoding="utf-8", errors="replace") as fh:
        reader = csv.DictReader(fh)
        if not reader.fieldnames:
            print("CSV has no header row.")
            return

        normalised_fields = [f.lower().strip() for f in reader.fieldnames]
        reader.fieldnames = normalised_fields

        print(f"Columns found: {normalised_fields}")

        for row in reader:
            title = (row.get("title") or "").strip()
            if not title:
                skipped += 1
                continue

            appeared      = parse_int(row.get("appeared"))
            lang_type     = (row.get("type") or "").strip() or None
            rank          = parse_int(row.get("rank"))
            language_rank = parse_int(row.get("languagerank"))
            fact_count    = parse_int(row.get("factcount"))
            last_activity = parse_int(row.get("lastactivity"))
            example_count = parse_int(row.get("examplecount"))
            book_count    = parse_int(row.get("bookcount"))

            cur.execute("""
                INSERT OR REPLACE INTO programming_languages
                    (title, appeared, type, rank, language_rank,
                     fact_count, last_activity, example_count, book_count)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                title, appeared, lang_type, rank, language_rank,
                fact_count, last_activity, example_count, book_count,
            ))
            inserted += 1

    conn.commit()

    cur.execute("""
        SELECT COUNT(DISTINCT r.language) AS matched
        FROM repositories r
        JOIN programming_languages pl ON LOWER(r.language) = LOWER(pl.title)
        WHERE r.language IS NOT NULL
    """)
    matched = cur.fetchone()["matched"]

    cur.execute("""
        SELECT COUNT(DISTINCT language) AS total
        FROM repositories
        WHERE language IS NOT NULL
    """)
    total_langs = cur.fetchone()["total"]

    conn.close()

    print(f"\n Import complete")
    print(f"   Languages imported : {inserted:,}")
    print(f"   Skipped (no title) : {skipped:,}")
    print(f"\n Coverage check:")
    print(f"   GitHub languages with Kaggle match: {matched}/{total_langs}")


def main():
    parser = argparse.ArgumentParser(description="Import Kaggle programming languages CSV")
    parser.add_argument("--csv", metavar="PATH", default=str(DEFAULT_CSV))
    args = parser.parse_args()

    csv_path = Path(args.csv)
    if not csv_path.exists():
        print(f"File not found: {csv_path}")
        sys.exit(1)

    init_db()
    import_languages(csv_path)


if __name__ == "__main__":
    main()