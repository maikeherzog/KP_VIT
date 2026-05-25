# Habitable Worlds — Backend

Python + FastAPI backend for the "Search for Habitable Worlds" 3D storytelling app.

## Setup with database

```bash
cd backend
git lfs pull # to get the database
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn api.main:app --reload --port 8000
```
You can find the API at http://localhost:8000/docs



## Data Pipeline (run once) --> It doesn't matter unless you want to set up the database from scratch again.

- Download datasets from huggingface and save them under backend/data
- Run the following steps:
  ´´´bash
    export GITHUB_TOKEN=ghp_your_token_here   # get one at github.com/settings/tokens
    python database.py
    python scripts/00_import_languages.py --csv data/programming_languages_data.csv
    python scripts/01_import_huggingface.py --csv data/github-top-projects-data-full.csv
    python scripts/02_enrich_github.py        # ~3 Stunden
    python scripts/03_compute_scores.py
  ´´´


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


## setup with LLM
- Download ollama 
- Download deepseek-coder:6.7b and llama3.2:1b models using ollama:
   - open command prompt and write:
     - ```ollama pull deepseek-coder:6.7b```
     - ```ollama pull llama3.2:1b```
- Run deepseek-coder:6.7b and llama3.2:1b models:
   - open command prompt and write:
     - ```ollama run deepseek-coder:6.7b```
     - ```ollama run llama3.2:1b```
- Run the LLM server:
  - ```py server.py```
- Run the website
  - ```npm run dev```
- Ask the LLM about the dataset in the chatbox, for example: "give me the number of stars for the repo netdata"    
