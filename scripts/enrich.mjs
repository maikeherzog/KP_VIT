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
// Flags:
//   --limit <n>            cap the number of seed repos (default 40)
//   --full                 use the large "full" config (~14.5k unique repos)
//   --config <name>        pick the HF config explicitly (monthly | full)
//   --token <ghp_…>        GitHub token (or set GITHUB_TOKEN env var)
//   --force                refetch repos already cached in the DB
//   --rescan               ignore the cached seed list and re-download the CSV
//   --skip-failed-forks    (build) drop repos whose forks fetch had failed
//
// A GITHUB_TOKEN is optional (raises 60 → 5000 requests/hour). Requires Node 18+.

import { writeFile, readFile, mkdir, rename } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { galaxyMetaFor, languageKey, deadGalaxies } from '../src/data/languages.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH    = resolve(__dirname, '../data/repos.db.json')        // raw source database
const SEEDS_PATH = resolve(__dirname, '../data/seeds.json')          // cached HF seed lists
const OUT_PATH   = resolve(__dirname, '../public/data/universe.json') // built artifact
const SEED_CACHE_DAYS = 7

const LIMITS = {
  SEED_REPOS: 40,            // population pulled from HF (small for a proof of concept)
  MAX_GALAXIES: 54,
  MAX_SYSTEMS_PER_GALAXY: 100,
  MAX_PLANETS_PER_SYSTEM: 8,
}
const STALE_DAYS = 30

const HF_DATASET = 'ronantakizawa/github-top-projects'
let TOKEN = process.env.GITHUB_TOKEN || ''   // can be overridden by --token
function ghHeaders() {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
  }
}

const NOW = Date.now()
const YEAR_MS = 365 * 24 * 60 * 60 * 1000
const log = (...a) => console.log('[data]', ...a)

// Live progress bar (sized to the run's total). Falls back to periodic line
// logging when stdout isn't an interactive terminal.
function createProgress(total) {
  const tty = process.stdout.isTTY
  const width = 24
  return {
    update(done, info = '') {
      const label = info.length > 42 ? info.slice(0, 41) + '…' : info
      if (tty) {
        const ratio = total ? Math.min(1, done / total) : 0
        const filled = Math.round(ratio * width)
        const bar = '█'.repeat(filled) + '░'.repeat(width - filled)
        const pct = String(Math.round(ratio * 100)).padStart(3)
        process.stdout.write(`\r\x1b[2K[${bar}] ${pct}%  ${done}/${total}  ${label}`)
      } else if (done % 5 === 0 || done === total) {
        log(`  ${done}/${total}  ${label}`)
      }
    },
    done() { if (tty) process.stdout.write('\n') },
  }
}

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
  // atomic: write to a temp file then rename, so an interrupt can't corrupt the DB
  const tmp = `${DB_PATH}.tmp`
  await writeFile(tmp, JSON.stringify(db, null, 2))
  await rename(tmp, DB_PATH)
}

async function loadSeedCache() {
  try { return JSON.parse(await readFile(SEEDS_PATH, 'utf8')) } catch { return {} }
}
async function saveSeedCache(cache) {
  await mkdir(dirname(SEEDS_PATH), { recursive: true })
  const tmp = `${SEEDS_PATH}.tmp`
  await writeFile(tmp, JSON.stringify(cache, null, 2))
  await rename(tmp, SEEDS_PATH)
}

// ── GitHub fetch ─────────────────────────────────────────────────────────────
async function ghFetch(url) {
  const res = await fetch(url, { headers: ghHeaders() })
  const remaining = Number(res.headers.get('x-ratelimit-remaining') ?? '1')
  if (res.status === 403 && remaining === 0) {
    const reset = Number(res.headers.get('x-ratelimit-reset') ?? '0') * 1000
    throw new RateLimitError(Math.max(0, reset - Date.now()) + 1000)
  }
  if (!res.ok) throw new Error(`GitHub ${res.status} for ${url}`)
  return res.json()
}

// ── Stage 1: seed list from HuggingFace ──────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Both configs are time-series CSVs — the same repos repeat across months/days —
// so the unique repo count is far below the raw row count.
const CONFIGS = {
  monthly: { ownerKey: 'repo_owner', nameKey: 'repo_name' },
  full:    { ownerKey: 'repo_owner', nameKey: 'name' },
}

// Download the whole config CSV in one request. The paginated /rows API rate
// limits hard (429) long before we can read all ~4200 pages, so we grab the raw
// file directly and parse it locally instead.
async function downloadCsv(configName) {
  const url = `https://huggingface.co/datasets/${HF_DATASET}/resolve/main/${configName}/data.csv`
  let lastErr
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url)
      if (res.ok) return res.text()
      lastErr = new Error(`HF ${res.status}`)
    } catch (e) {
      lastErr = e
    }
    await sleep(1500 * (attempt + 1))
  }
  throw lastErr ?? new Error('CSV download failed')
}

// minimal CSV line tokeniser (handles quoted fields)
function parseCsvLine(line) {
  const out = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQ) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else inQ = false }
      else cur += ch
    } else if (ch === '"') inQ = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

async function loadSeedRepos(limit, configName = 'monthly', { rescan = false } = {}) {
  const cfg = CONFIGS[configName] ?? CONFIGS.monthly

  // Reuse a cached seed list so resuming a run doesn't re-download/parse the CSV.
  const cache = await loadSeedCache()
  const entry = cache[configName]
  const ageDays = entry ? (Date.now() - Date.parse(entry.savedAt)) / 86_400_000 : Infinity
  if (!rescan && entry?.complete && ageDays < SEED_CACHE_DAYS) {
    log(`reusing cached seed list (${entry.repos.length} repos from "${configName}", ${ageDays.toFixed(1)}d old)`)
    return entry.repos.slice(0, limit)
  }

  log(`downloading ${configName}/data.csv from HuggingFace…`)
  const text = await downloadCsv(configName)
  const lines = text.split(/\r?\n/)
  const header = parseCsvLine(lines[0])
  const oi = header.indexOf(cfg.ownerKey)
  const ni = header.indexOf(cfg.nameKey)
  const si = header.indexOf('star_count')
  if (oi < 0 || ni < 0) throw new Error(`unexpected CSV header: ${header.join(',')}`)

  const seen = new Map()
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue
    const f = parseCsvLine(lines[i])
    const owner = f[oi]
    const name = f[ni]
    if (!owner || !name) continue
    const stars = Number(f[si]) || 0
    const id = `${owner}/${name}`
    const prev = seen.get(id)
    if (!prev || stars > prev.stars) seen.set(id, { owner, name, stars })
  }

  const all = [...seen.values()].sort((a, b) => b.stars - a.stars)
  cache[configName] = { savedAt: new Date().toISOString(), complete: true, repos: all }
  await saveSeedCache(cache)
  log(`parsed ${lines.length - 1} rows → ${all.length} unique repos from "${configName}"`)
  if (limit > all.length) log(`note: only ${all.length} unique repos available — capping --limit ${limit}.`)
  return all.slice(0, limit)
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
  let forksFailed = false
  try {
    const forks = await ghFetch(
      `https://api.github.com/repos/${owner}/${name}/forks?sort=stargazers&per_page=${LIMITS.MAX_PLANETS_PER_SYSTEM}`,
    )
    planets = (forks ?? []).map((f) => ({
      id: f.full_name, name: f.name, owner: f.owner?.login ?? '', stars: f.stargazers_count ?? 0,
    }))
  } catch (err) {
    if (err instanceof RateLimitError) throw err
    forksFailed = true // distinguish "forks call failed" from "genuinely no forks"
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
    ...(forksFailed ? { forksFailed: true } : {}),
  }
}

function isFresh(record) {
  if (!record?.fetchedAt) return false
  return NOW - Date.parse(record.fetchedAt) < STALE_DAYS * 24 * 60 * 60 * 1000
}

async function cmdFetch({ limit, force, config, rescan }) {
  if (!TOKEN) log('no GITHUB_TOKEN — limited to 60 requests/hour (resumable: just re-run to continue).')
  const db = await loadDB()
  const seeds = await loadSeedRepos(limit, config, { rescan })
  log(`config=${config} · ${seeds.length} seed repos from HuggingFace · ${Object.keys(db.repos).length} already in DB`)

  const total = seeds.length
  const progress = createProgress(total)
  const warnings = []
  let fetched = 0, skipped = 0

  for (let i = 0; i < seeds.length; i++) {
    const seed = seeds[i]
    const key = `${seed.owner}/${seed.name}`

    if (!force && isFresh(db.repos[key])) {
      skipped++
      progress.update(i + 1, `cached ${key}`)
      continue
    }

    try {
      db.repos[key] = await enrichRepo(seed)
      await saveDB(db)                    // persist progress after every repo
      fetched++
      progress.update(i + 1, `✓ ${key}`)
    } catch (err) {
      if (err instanceof RateLimitError) {
        if (TOKEN) {
          progress.update(i + 1, `rate limit — waiting ${Math.round(err.resetMs / 1000)}s`)
          await new Promise((r) => setTimeout(r, err.resetMs))
          i--                              // retry same seed
          continue
        }
        progress.done()
        log(`rate limit reached. Progress saved (${fetched} new). Run again later to resume.`)
        return
      }
      warnings.push(`skip ${key}: ${err.message}`)
      progress.update(i + 1, `✗ ${key}`)
    }
  }

  progress.done()
  for (const w of warnings) log('  ' + w)
  log(`fetch done — ${fetched} fetched, ${skipped} fresh-skipped, ${Object.keys(db.repos).length} total in DB`)
}

// ── Stage 2: build universe.json from the database ───────────────────────────
// A repo's forks fetch failed if it was flagged at fetch time, OR (retroactive
// for older DB entries) it reports forks but we captured none.
function forksMissing(s) {
  return s.forksFailed === true || ((s.forks ?? 0) > 0 && !(s.planets?.length))
}

function buildUniverse(systems, { skipFailedForks = false } = {}) {
  const byLang = new Map()
  for (const s of systems) {
    if (!s.language) continue
    if (skipFailedForks && forksMissing(s)) continue // drop repos with failed/missing forks
    const key = languageKey(s.language)
    if (!byLang.has(key)) byLang.set(key, { language: s.language, systems: [] })
    byLang.get(key).systems.push(s)
  }

  let galaxies = [...byLang.entries()].map(([key, { language, systems: sys }]) => {
    const meta = galaxyMetaFor(language)
    const trimmed = sys.sort((a, b) => b.stars - a.stars).slice(0, LIMITS.MAX_SYSTEMS_PER_GALAXY)
    return { id: key, name: meta.name, color: meta.color, born: meta.born, systemCount: trimmed.length, systems: trimmed }
  })

  galaxies = galaxies.sort((a, b) => b.systemCount - a.systemCount).slice(0, LIMITS.MAX_GALAXIES)
  galaxies.push(...deadGalaxies())          // extinct languages → black holes

  return { generatedAt: new Date().toISOString(), source: HF_DATASET, galaxies }
}

async function cmdBuild({ skipFailedForks = false } = {}) {
  const db = await loadDB()
  const systems = Object.values(db.repos)
  if (!systems.length) { log('database is empty — run `node scripts/enrich.mjs fetch` first.'); return }
  const failed = systems.filter(forksMissing).length
  if (skipFailedForks && failed) log(`skipping ${failed} repos whose forks fetch had failed`)
  const universe = buildUniverse(systems, { skipFailedForks })
  await mkdir(dirname(OUT_PATH), { recursive: true })
  await writeFile(OUT_PATH, JSON.stringify(universe, null, 2))
  const used = skipFailedForks ? systems.length - failed : systems.length
  log(`built ${universe.galaxies.length} galaxies (${used} repos) → ${OUT_PATH}`)
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const cmd = argv.find((a) => ['fetch', 'build', 'all'].includes(a)) ?? 'all'
  const limIdx = argv.indexOf('--limit')
  const limit = limIdx >= 0 ? Number(argv[limIdx + 1]) : LIMITS.SEED_REPOS
  const tokIdx = argv.indexOf('--token')
  const token = tokIdx >= 0 ? argv[tokIdx + 1] : null
  const cfgIdx = argv.indexOf('--config')
  const config = argv.includes('--full') ? 'full' : (cfgIdx >= 0 ? argv[cfgIdx + 1] : 'monthly')
  return {
    cmd, limit, token, config,
    force: argv.includes('--force'),
    rescan: argv.includes('--rescan'),
    skipFailedForks: argv.includes('--skip-failed-forks'),
  }
}

async function main() {
  const { cmd, limit, force, token, config, rescan, skipFailedForks } = parseArgs(process.argv.slice(2))
  if (token) TOKEN = token   // --token overrides the env var
  if (cmd === 'fetch') { await cmdFetch({ limit, force, config, rescan }) }
  else if (cmd === 'build') { await cmdBuild({ skipFailedForks }) }
  else { await cmdFetch({ limit, force, config, rescan }); await cmdBuild({ skipFailedForks }) }
}

main().catch((err) => { console.error('[data] fatal:', err); process.exit(1) })
