#!/usr/bin/env node
// Two-stage data pipeline for the universe.
//
//   node scripts/enrich.mjs fetch   → pull repo data from GitHub into the local
//                                      database (data/repos.db.json). Resumable:
//                                      progress is saved after every repo, so if
//                                      the (unauthenticated) rate limit is hit you
//                                      can just run it again later to continue.
//   node scripts/enrich.mjs build   → rebuild public/data/universe.json from the
//                                      database (no network needed).
//   node scripts/enrich.mjs         → fetch, then build.
//
// Flags:  --limit <n>  cap the number of seed repos   --force  refetch cached repos
//
// A GITHUB_TOKEN env var is optional (raises 60 → 5000 requests/hour) but not
// required. Requires Node 18+ (global fetch).

import { writeFile, readFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { metaForLanguage, languageKey, deadGalaxies } from '../src/data/languages.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH  = resolve(__dirname, '../data/repos.db.json')        // raw source database
const OUT_PATH = resolve(__dirname, '../public/data/universe.json') // built artifact

const LIMITS = {
  SEED_REPOS: 40,            // population pulled from HF (small for a proof of concept)
  MAX_GALAXIES: 12,
  MAX_SYSTEMS_PER_GALAXY: 24,
  MAX_PLANETS_PER_SYSTEM: 5,
}
const STALE_DAYS = 30

const HF_DATASET = 'ronantakizawa/github-top-projects'
const TOKEN = process.env.GITHUB_TOKEN || ''
const GH_HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
}

const NOW = Date.now()
const YEAR_MS = 365 * 24 * 60 * 60 * 1000
const log = (...a) => console.log('[data]', ...a)

class RateLimitError extends Error {
  constructor(resetMs) { super('rate limited'); this.resetMs = resetMs }
}

// ── tiny JSON "database" ─────────────────────────────────────────────────────
async function loadDB() {
  try {
    const raw = await readFile(DB_PATH, 'utf8')
    return JSON.parse(raw)
  } catch {
    return { updatedAt: null, repos: {} }
  }
}
async function saveDB(db) {
  db.updatedAt = new Date().toISOString()
  await mkdir(dirname(DB_PATH), { recursive: true })
  await writeFile(DB_PATH, JSON.stringify(db, null, 2))
}

// ── GitHub fetch ─────────────────────────────────────────────────────────────
async function ghFetch(url) {
  const res = await fetch(url, { headers: GH_HEADERS })
  const remaining = Number(res.headers.get('x-ratelimit-remaining') ?? '1')
  if (res.status === 403 && remaining === 0) {
    const reset = Number(res.headers.get('x-ratelimit-reset') ?? '0') * 1000
    throw new RateLimitError(Math.max(0, reset - Date.now()) + 1000)
  }
  if (!res.ok) throw new Error(`GitHub ${res.status} for ${url}`)
  return res.json()
}

// ── Stage 1: seed list from HuggingFace ──────────────────────────────────────
async function loadSeedRepos(limit) {
  const url = new URL('https://datasets-server.huggingface.co/rows')
  url.searchParams.set('dataset', HF_DATASET)
  url.searchParams.set('config', 'monthly')
  url.searchParams.set('split', 'train')
  url.searchParams.set('length', '100')

  const seen = new Map()
  for (let offset = 0; offset < 3200; offset += 100) {
    url.searchParams.set('offset', String(offset))
    const json = await (await fetch(url)).json()
    const rows = (json.rows ?? []).map((r) => r.row)
    if (!rows.length) break
    for (const r of rows) {
      const id = `${r.repo_owner}/${r.repo_name}`
      const prev = seen.get(id)
      if (!prev || r.star_count > prev.stars) {
        seen.set(id, { owner: r.repo_owner, name: r.repo_name, stars: r.star_count })
      }
    }
    if (seen.size >= limit * 2) break
  }
  return [...seen.values()].sort((a, b) => b.stars - a.stars).slice(0, limit)
}

// ── Stage 1: enrich one repo (repo metadata + notable forks) ─────────────────
async function enrichRepo(seed) {
  const { owner, name } = seed
  const repo = await ghFetch(`https://api.github.com/repos/${owner}/${name}`)

  const pushedAt = repo.pushed_at ? Date.parse(repo.pushed_at) : NOW - 5 * YEAR_MS
  const ageMs = NOW - pushedAt
  const activity = Math.max(0, Math.min(1, 1 - ageMs / (2 * YEAR_MS)))
  const habitable = ageMs < YEAR_MS && !repo.archived

  let planets = []
  try {
    const forks = await ghFetch(
      `https://api.github.com/repos/${owner}/${name}/forks?sort=stargazers&per_page=${LIMITS.MAX_PLANETS_PER_SYSTEM}`,
    )
    planets = (forks ?? []).map((f) => ({
      id: f.full_name, name: f.name, owner: f.owner?.login ?? '', stars: f.stargazers_count ?? 0,
    }))
  } catch (err) {
    if (err instanceof RateLimitError) throw err
    log(`  forks failed for ${owner}/${name}: ${err.message}`)
  }

  return {
    id: repo.full_name, owner, name, fullName: repo.full_name,
    language: repo.language,
    stars: repo.stargazers_count ?? seed.stars,
    forks: repo.forks_count ?? 0,
    activity: Number(activity.toFixed(3)),
    habitable,
    born: repo.created_at ? new Date(repo.created_at).getFullYear() : null,
    planets,
    fetchedAt: new Date().toISOString(),
  }
}

function isFresh(record) {
  if (!record?.fetchedAt) return false
  return NOW - Date.parse(record.fetchedAt) < STALE_DAYS * 24 * 60 * 60 * 1000
}

async function cmdFetch({ limit, force }) {
  if (!TOKEN) log('no GITHUB_TOKEN — limited to 60 requests/hour (resumable: just re-run to continue).')
  const db = await loadDB()
  const seeds = await loadSeedRepos(limit)
  log(`${seeds.length} seed repos from HuggingFace · ${Object.keys(db.repos).length} already in DB`)

  let fetched = 0, skipped = 0
  for (let i = 0; i < seeds.length; i++) {
    const seed = seeds[i]
    const key = `${seed.owner}/${seed.name}`
    if (!force && isFresh(db.repos[key])) { skipped++; continue }

    try {
      db.repos[key] = await enrichRepo(seed)
      await saveDB(db)                    // persist progress after every repo
      fetched++
      if (fetched % 5 === 0) log(`  fetched ${fetched} (${key})`)
    } catch (err) {
      if (err instanceof RateLimitError) {
        if (TOKEN) {
          log(`  rate limit — waiting ${Math.round(err.resetMs / 1000)}s…`)
          await new Promise((r) => setTimeout(r, err.resetMs))
          i--                              // retry same seed
          continue
        }
        log(`rate limit reached. Progress saved (${fetched} new). Run again later to resume.`)
        return
      }
      log(`  skip ${key}: ${err.message}`)
    }
  }
  log(`fetch done — ${fetched} fetched, ${skipped} fresh-skipped, ${Object.keys(db.repos).length} total in DB`)
}

// ── Stage 2: build universe.json from the database ───────────────────────────
function buildUniverse(systems) {
  const byLang = new Map()
  for (const s of systems) {
    if (!s.language) continue
    const key = languageKey(s.language)
    if (!byLang.has(key)) byLang.set(key, [])
    byLang.get(key).push(s)
  }

  let galaxies = [...byLang.entries()].map(([key, sys]) => {
    const meta = metaForLanguage(key)
    const trimmed = sys.sort((a, b) => b.stars - a.stars).slice(0, LIMITS.MAX_SYSTEMS_PER_GALAXY)
    return { id: key, name: meta.name, color: meta.color, born: meta.born, systemCount: trimmed.length, systems: trimmed }
  })

  galaxies = galaxies.sort((a, b) => b.systemCount - a.systemCount).slice(0, LIMITS.MAX_GALAXIES)
  galaxies.push(...deadGalaxies())          // extinct languages → black holes

  return { generatedAt: new Date().toISOString(), source: HF_DATASET, galaxies }
}

async function cmdBuild() {
  const db = await loadDB()
  const systems = Object.values(db.repos)
  if (!systems.length) { log('database is empty — run `node scripts/enrich.mjs fetch` first.'); return }
  const universe = buildUniverse(systems)
  await mkdir(dirname(OUT_PATH), { recursive: true })
  await writeFile(OUT_PATH, JSON.stringify(universe, null, 2))
  log(`built ${universe.galaxies.length} galaxies (${systems.length} repos) → ${OUT_PATH}`)
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const cmd = argv.find((a) => !a.startsWith('-')) ?? 'all'
  const limIdx = argv.indexOf('--limit')
  const limit = limIdx >= 0 ? Number(argv[limIdx + 1]) : LIMITS.SEED_REPOS
  return { cmd, limit, force: argv.includes('--force') }
}

async function main() {
  const { cmd, limit, force } = parseArgs(process.argv.slice(2))
  if (cmd === 'fetch') { await cmdFetch({ limit, force }) }
  else if (cmd === 'build') { await cmdBuild() }
  else { await cmdFetch({ limit, force }); await cmdBuild() }
}

main().catch((err) => { console.error('[data] fatal:', err); process.exit(1) })
