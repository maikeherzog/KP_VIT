# Habitable Worlds — Backend

Python + FastAPI backend for the "Search for Habitable Worlds" 3D storytelling app.

## Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Data Pipeline (run once)

### Step 1 — Import HuggingFace dataset

**Option A** — Download automatically:
```bash
python scripts/01_import_huggingface.py --hf
```

**Option B** — Use a local CSV:
```bash
python scripts/01_import_huggingface.py --csv /path/to/github-top-projects.csv
```

### Step 2 — Enrich via GitHub API

```bash
export GITHUB_TOKEN=ghp_your_token_here   # get one at github.com/settings/tokens
python scripts/02_enrich_github.py
```

This will take ~2–3 hours for the full dataset (rate limit: 5 000 req/h).
You can interrupt and resume — already-enriched repos are skipped.

To test with a small batch first:
```bash
python scripts/02_enrich_github.py --limit 100
```

### Step 3 — Compute habitability scores

```bash
python scripts/03_compute_scores.py
```

Runs in < 1 minute locally.

## Start the API Server

```bash
uvicorn api.main:app --reload --port 8000
```

- Swagger UI: http://localhost:8000/docs
- Health check: http://localhost:8000/health


## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_TOKEN` | Recommended | GitHub PAT for enrichment (5k req/h vs 60) otherwise slower |


## Habitability Score Model

Each repo is scored 0.0–1.0 from four weighted factors:

| Factor | Weight | Signal |
|--------|--------|--------|
| Recency | 35% | Days since last git push (180-day half-life) |
| Trending | 25% | Frequency × recency of trending appearances |
| Popularity | 25% | Star count (log-scaled, cap at 100k) |
| Issues | 15% | Open issue count (moderate = active) |

Star type classification:
- `main_sequence` → score ≥ 0.6 (active, habitable)
- `red_giant` → score 0.3–0.6, formerly popular
- `white_dwarf` → score 0.1–0.3
- `black_hole` → archived OR score < 0.1
