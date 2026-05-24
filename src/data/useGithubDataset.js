import { useState, useEffect } from 'react'

const HF_API = 'https://datasets-server.huggingface.co/rows'

// Deterministic color per known organization
const KNOWN_OWNERS = {
  google: '#4285F4',
  microsoft: '#0078D4',
  openai: '#10A37F',
  meta: '#1877F2',
  facebook: '#1877F2',
  vercel: '#E5E7EB',
  anthropic: '#D97B4A',
  bytedance: '#FE2C55',
  nvidia: '#76B900',
  aws: '#FF9900',
  huggingface: '#FFD21E',
}

function ownerToColor(owner) {
  const known = KNOWN_OWNERS[owner.toLowerCase()]
  if (known) return known
  // Hash unknown owner name → HSL hue (deterministic, no Math.random)
  let hash = 0
  for (const c of owner) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 65%, 62%)`
}

// Log-normalize value from [min, max] into [outMin, outMax]
function logNorm(value, min, max, outMin, outMax) {
  if (max === min) return outMin
  const logVal = Math.log1p(value - min)
  const logMax = Math.log1p(max - min)
  return outMin + (logVal / logMax) * (outMax - outMin)
}

// Visual encoding documentation (used by the legend overlay)
export const ENCODING_LEGEND = [
  { visual: 'Planet size',    data: 'Star count (log scale)' },
  { visual: 'Orbit distance', data: 'Rank (rank 1 = closest to sun)' },
  { visual: 'Orbit speed',    data: 'Ranking appearances (more = faster)' },
  { visual: 'Rotation speed', data: 'Fork count (log scale)' },
  { visual: 'Color',          data: 'Repository owner / organization' },
]

export function mapToPlanets(rows, topN = 20) {
  const sorted = [...rows].sort((a, b) => a.rank - b.rank).slice(0, topN)
  const count = sorted.length

  const maxStars = Math.max(...sorted.map(r => r.star_count))
  const minStars = Math.min(...sorted.map(r => r.star_count))
  const maxForks = Math.max(...sorted.map(r => r.fork_count))
  const minForks = Math.min(...sorted.map(r => r.fork_count))
  const maxApp   = Math.max(...sorted.map(r => r.ranking_appearances))
  const minApp   = Math.min(...sorted.map(r => r.ranking_appearances))

  return sorted.map((r, i) => {
    // rank 1 → orbit 4, rank N → orbit 14
    const orbitRadius = 4 + (r.rank - 1) / Math.max(count - 1, 1) * 10

    // inner planets move faster (Kepler approximation): rank 1 → 0.38, rank N → 0.07
    const orbitSpeed = 0.38 - (r.rank - 1) / Math.max(count - 1, 1) * 0.31

    return {
      id: i,
      name: r.repo_name,
      owner: r.repo_owner,
      fullName: r.repository,
      stars: r.star_count,
      forks: r.fork_count,
      appearances: r.ranking_appearances,
      rank: r.rank,
      month: r.month,
      // --- visual encoding ---
      radius:        logNorm(r.star_count, minStars, maxStars, 0.18, 0.88),
      color:         ownerToColor(r.repo_owner),
      orbitRadius,
      orbitSpeed,
      orbitOffset:   (i / count) * Math.PI * 2,           // evenly spread start positions
      rotationSpeed: logNorm(r.fork_count, minForks, maxForks, 0.05, 0.45),
    }
  })
}

export function useGithubDataset({ topN = 20 } = {}) {
  const [planets, setPlanets]   = useState([])
  const [month,   setMonth]     = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error,   setError]     = useState(null)

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      try {
        const url = new URL(HF_API)
        url.searchParams.set('dataset', 'ronantakizawa/github-top-projects')
        url.searchParams.set('config',  'monthly')
        url.searchParams.set('split',   'train')
        url.searchParams.set('offset',  '0')
        url.searchParams.set('limit',   '200')  // covers 4 months of top-50 data

        const res = await fetch(url.toString(), { signal: controller.signal })
        if (!res.ok) throw new Error(`HuggingFace API returned ${res.status}`)

        const json = await res.json()
        const rows = json.rows.map(r => r.row)

        // Take only the most recent month's data
        const latestMonth = [...new Set(rows.map(r => r.month))].sort().at(-1)
        const monthRows = rows.filter(r => r.month === latestMonth)

        setMonth(latestMonth)
        setPlanets(mapToPlanets(monthRows, topN))
      } catch (err) {
        if (err.name !== 'AbortError') setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    load()
    return () => controller.abort()
  }, [topN])

  return { planets, month, loading, error }
}
