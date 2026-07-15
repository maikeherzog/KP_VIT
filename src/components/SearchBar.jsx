import { useEffect, useMemo, useState } from 'react'

// Flatten galaxies + their systems into a searchable index.
function buildIndex(galaxies) {
  const items = []
  for (const g of galaxies) {
    items.push({ type: 'galaxy', id: g.id, label: g.name, sub: `${g.systemCount} repos`, galaxy: g })
    for (const s of g.systems ?? []) {
      items.push({ type: 'system', id: s.id, label: s.fullName, sub: g.name, galaxy: g, system: s })
    }
  }
  return items
}

export default function SearchBar({ galaxies, onPickGalaxy, onPickSystem, isOpen, onOpenChange }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const index = useMemo(() => buildIndex(galaxies), [galaxies])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return index
      .filter((it) => it.label.toLowerCase().includes(q))
      .sort((a, b) => {
        // exact-prefix matches and galaxies first
        const ap = a.label.toLowerCase().startsWith(q) ? 0 : 1
        const bp = b.label.toLowerCase().startsWith(q) ? 0 : 1
        if (ap !== bp) return ap - bp
        return (a.type === 'galaxy' ? 0 : 1) - (b.type === 'galaxy' ? 0 : 1)
      })
      .slice(0, 7)
  }, [query, index])

  useEffect(() => {
    if (!isOpen && open) {
      setOpen(false)
    }
  }, [isOpen, open])

  function pick(it) {
    if (it.type === 'galaxy') onPickGalaxy(it.galaxy.id)
    else onPickSystem(it.galaxy.id, it.system)
    setQuery('')
    setOpen(false)
    onOpenChange?.(false)
  }

  return (
    <div className="absolute bottom-6 right-24 w-72 font-mono">
      {open && results.length > 0 && (
        <div className="mb-2 bg-black/80 border border-white/20 rounded-xl overflow-hidden backdrop-blur-sm">
          {results.map((it) => (
            <button
              key={`${it.type}:${it.id}`}
              className="w-full text-left px-3 py-2 hover:bg-white/10 flex items-center gap-2 transition-colors"
              onMouseDown={(e) => { e.preventDefault(); pick(it) }}
            >
              <span className="text-xs" style={{ opacity: 0.5 }}>
                {it.type === 'galaxy' ? '✦' : '★'}
              </span>
              <span className="text-white text-xs truncate flex-1">{it.label}</span>
              <span className="text-white/40 text-[10px]">{it.sub}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 bg-black/70 border border-white/25 rounded-full px-4 py-2 backdrop-blur-sm">
        <span className="text-white/50 text-sm">⚲</span>
        <input
          value={query}
          onChange={(e) => {
            const value = e.target.value
            setQuery(value)
            if (value.trim()) {
              setOpen(true)
              onOpenChange?.(true)
            } else {
              setOpen(false)
              onOpenChange?.(false)
            }
          }}
          onFocus={() => {
            if (query.trim()) {
              setOpen(true)
              onOpenChange?.(true)
            }
          }}
          onBlur={() => {
            setOpen(false)
            onOpenChange?.(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results[0]) pick(results[0])
            if (e.key === 'Escape') { setQuery(''); e.currentTarget.blur() }
          }}
          placeholder="search galaxies & repos…"
          className="bg-transparent outline-none text-white text-xs flex-1 placeholder-white/35"
        />
      </div>
    </div>
  )
}
