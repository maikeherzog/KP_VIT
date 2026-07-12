import { useState, useEffect } from 'react'
import { LANGUAGE_META, galaxyMetaFor, deadGalaxies } from './languages'

// Where the FastAPI data backend lives (Maike's /repos/universe endpoint).
// Override with VITE_API_URL in a .env file if the backend runs elsewhere.
const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const MAX_SYSTEMS_PER_GALAXY = 100
const MAX_GALAXIES = 60

// Group a flat repo list (from the API) into the galaxy structure the app renders.
// Mirrors buildUniverse() in scripts/enrich.mjs so API and static JSON look identical.
function buildGalaxiesFromRepos(repos) {
  const byLang = new Map()
  for (const r of repos) {
    if (!r.language) continue
    const key = r.language.toLowerCase()
    if (!byLang.has(key)) byLang.set(key, { language: r.language, systems: [] })
    byLang.get(key).systems.push(r)
  }

  let galaxies = [...byLang.entries()].map(([key, { language, systems }]) => {
    const meta = galaxyMetaFor(language)
    const trimmed = systems.sort((a, b) => b.stars - a.stars).slice(0, MAX_SYSTEMS_PER_GALAXY)
    return { id: key, name: meta.name, color: meta.color, born: meta.born, systemCount: trimmed.length, systems: trimmed }
  })

  galaxies = galaxies.sort((a, b) => b.systemCount - a.systemCount).slice(0, MAX_GALAXIES)
  galaxies.push(...deadGalaxies()) // extinct languages → black holes

  return { generatedAt: new Date().toISOString(), source: 'api', galaxies }
}

// 1) Live data from the FastAPI backend (paginated, with a per-request timeout).
async function loadFromApi() {
  const items = []
  for (let page = 1; page <= 40; page++) {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), 5000)
    let json
    try {
      const res = await fetch(`${API_BASE}/repos/universe?page=${page}&page_size=5000`, { signal: ac.signal })
      if (!res.ok) throw new Error(`API ${res.status}`)
      json = await res.json()
    } finally {
      clearTimeout(timer)
    }
    items.push(...(json.items ?? []))
    if (!json.items?.length || items.length >= (json.total ?? 0)) break
  }
  if (!items.length) throw new Error('API returned no repos')
  return buildGalaxiesFromRepos(items)
}

// 2) The committed static snapshot (built by scripts/enrich.mjs).
async function loadStatic() {
  const res = await fetch('/data/universe.json')
  if (!res.ok) throw new Error(`universe.json ${res.status}`)
  const json = await res.json()
  if (!json.galaxies?.length) throw new Error('empty universe')
  return { ...json, source: 'static' }
}

// 3) Synthetic data so the screen is never blank if both sources fail.
function buildFallback() {
  const galaxies = Object.entries(LANGUAGE_META).map(([id, meta]) => {
    const systemCount = 3 + (id.length % 4)
    const systems = Array.from({ length: systemCount }, (_, i) => ({
      id: `${id}/sample-${i}`,
      owner: meta.name.toLowerCase(),
      name: `sample-${i}`,
      fullName: `${meta.name}/sample-${i}`,
      language: meta.name,
      stars: Math.round(5000 + ((i * 37 + id.length * 11) % 90) * 1500),
      forks: Math.round(500 + ((i * 13) % 40) * 200),
      activity: ((i * 7 + id.length) % 100) / 100,
      habitable: (i + id.length) % 3 !== 0,
      born: meta.born + 10 + (i % 12),
      planets: [],
    }))
    return { id, name: meta.name, color: meta.color, born: meta.born, systemCount, systems }
  })
  return { generatedAt: null, source: 'fallback', galaxies: [...galaxies, ...deadGalaxies()] }
}

export function useUniverse() {
  const [universe, setUniverse] = useState(null)
  const [loading, setLoading] = useState(true)
  const [source, setSource] = useState(null) // 'api' | 'static' | 'fallback'

  useEffect(() => {
    let cancelled = false

    async function load() {
      let result = null
      let src = null

      // API → static JSON → synthetic, first one that works wins
      try { result = await loadFromApi(); src = 'api' }
      catch (e) { console.warn('[useUniverse] backend unavailable, falling back:', e.message) }

      if (!result) {
        try { result = await loadStatic(); src = 'static' }
        catch (e) { console.warn('[useUniverse] static universe.json unavailable:', e.message) }
      }

      if (!result) { result = buildFallback(); src = 'fallback' }

      if (!cancelled) {
        setUniverse(result)
        setSource(src)
        setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  return {
    universe,
    galaxies: universe?.galaxies ?? [],
    loading,
    source,
    usingFallback: source === 'fallback',
  }
}
