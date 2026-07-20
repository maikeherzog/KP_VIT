import * as THREE from 'three'

// Distribute repo star-systems across a flat galactic disk. A deterministic
// pseudo-random (seeded by repo id) keeps layout stable between reloads, with
// brighter/bigger repos pulled slightly toward the centre. Shared by GalaxyView
// (rendering) and the proximity detector so both use identical positions.
export function layoutSystems(systems) {
  const golden = Math.PI * (3 - Math.sqrt(5)) // golden angle for even spread
  const maxStars = Math.max(...systems.map((s) => s.stars), 1)

  // Star size is normalised *within this galaxy*: since almost every repo here
  // has thousands+ stars, an absolute log scale squashes them all into the same
  // size. Mapping the galaxy's own min→max log-stars onto the size range makes
  // the differences actually visible (and comparable at a glance inside the galaxy).
  const logs = systems.map((s) => Math.log10(Math.max(s.stars, 1)))
  const lo = Math.min(...logs)
  const hi = Math.max(...logs)
  const starSizeOf = (stars) => {
    const t = hi > lo ? (Math.log10(Math.max(stars, 1)) - lo) / (hi - lo) : 0.7
    return 0.6 + t * 2.8 // ~0.6 (smallest repo) → ~3.4 (biggest repo)
  }

  return systems.map((s, i) => {
    let seed = 0
    for (const c of s.id) seed = (seed * 31 + c.charCodeAt(0)) & 0xffffffff
    const rand = ((seed >>> 0) % 1000) / 1000

    // sqrt radius + golden angle = sunflower spiral → uniform density that scales
    // gracefully from a handful of systems to ~100. Bigger repos pulled inward.
    const importance = Math.log10(Math.max(s.stars, 1)) / Math.log10(maxStars)
    const radius = 30 * Math.sqrt(i + 1) * (1.08 - importance * 0.18)
    const angle = i * golden + rand * 0.5
    const y = (rand - 0.5) * 26

    return {
      system: s,
      position: new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius),
      starSize: starSizeOf(s.stars),
    }
  })
}
