import { useState, useEffect } from 'react'
import { LANGUAGE_META, deadGalaxies } from './languages'

// Minimal deterministic fallback so the screen is never blank if
// public/data/universe.json is missing (e.g. enrich.mjs hasn't been run yet).
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
  const [usingFallback, setUsingFallback] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      try {
        const res = await fetch('/data/universe.json', { signal: controller.signal })
        if (!res.ok) throw new Error(`universe.json ${res.status}`)
        const json = await res.json()
        if (!json.galaxies?.length) throw new Error('empty universe')
        setUniverse(json)
      } catch (err) {
        if (err.name === 'AbortError') return
        console.warn('[useUniverse] falling back to synthetic data:', err.message)
        setUniverse(buildFallback())
        setUsingFallback(true)
      } finally {
        setLoading(false)
      }
    }

    load()
    return () => controller.abort()
  }, [])

  return { universe, galaxies: universe?.galaxies ?? [], loading, usingFallback }
}
