import * as THREE from 'three'

// Distribute repo star-systems across a flat galactic disk. A deterministic
// pseudo-random (seeded by repo id) keeps layout stable between reloads, with
// brighter/bigger repos pulled slightly toward the centre. Shared by GalaxyView
// (rendering) and the proximity detector so both use identical positions.
export function layoutSystems(systems) {
  const golden = Math.PI * (3 - Math.sqrt(5)) // golden angle for even spread
  const maxStars = Math.max(...systems.map((s) => s.stars), 1)

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
    }
  })
}
