# Running the whole thing with Docker

One command brings up all four parts (frontend, data API, LLM server, and the LLM itself).

## Prerequisites

- **Docker Desktop** installed and running.
- The database file present: run once
  ```bash
  git lfs pull
  ```
  This fetches `backend/data/universe.db` (~50 MB), which the containers mount.

## Start

```bash
docker compose up --build
```

First run takes a while: it builds the images **and** downloads the LLM model
(`llama3.2:1b`, ~1.3 GB). Later runs are fast (model + images are cached).

Then open **http://localhost:5173** — use `localhost`, not `127.0.0.1` (CORS).

## What runs where

| Container | Host port | Role |
|-----------|------|------|
| `frontend` | 5173 | the app (nginx serving the built site) |
| `data-api` | 8400 | Maike's FastAPI — the universe data |
| `llm-api` | 3100 | Flask — chat + narrator |
| `ollama` | 11434 | the local LLM |
| `ollama-pull` | – | one-shot, downloads the model then exits |

> Host ports 8400/3100 are used because 8000 is reserved by Windows and 3000 is
> often already taken on this setup. The container-internal ports stay 8000/3000.

The browser talks to `data-api` (8000) and `llm-api` (3000); `llm-api` talks to
`ollama` inside the compose network. The universe data loads live from `data-api`;
if that container is down the frontend falls back to the committed snapshot.

## Everyday use

```bash
docker compose up            # start (after first build)
docker compose up -d         # start in the background
docker compose down          # stop everything
docker compose up --build    # rebuild after code changes
```

## Notes / gotchas

- **CPU only.** The LLM runs on CPU in the container, so narration/chat take a few
  seconds. That's expected. To use an NVIDIA GPU you'd add a `gpus: all` /
  device-reservation block to the `ollama` service — optional.
- **Port already in use?** If 8000, 3000 or 5173 is taken on the host, change the
  left-hand side of the `ports:` mapping in `docker-compose.yml`. If you change the
  data-api port, also change the `VITE_API_URL` build arg (the browser URL is baked
  into the frontend at build time), then `docker compose up --build`.
- **DB updates:** the DB is mounted, not baked in — replace `backend/data/universe.db`
  and restart, no rebuild needed.
- The native (non-Docker) setup still works unchanged; the code reads `OLLAMA_URL`
  and `DB_PATH` from the environment but defaults to the local values.
