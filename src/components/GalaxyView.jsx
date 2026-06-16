import { useMemo } from 'react'
import * as THREE from 'three'
import StarSystem from './StarSystem'
import GalaxyCore from './GalaxyCore'

// Distribute repo star-systems across a flat galactic disk. A deterministic
// pseudo-random (seeded by repo id) keeps layout stable between reloads, with
// brighter/bigger repos pulled slightly toward the centre.
function layoutSystems(systems) {
  const golden = Math.PI * (3 - Math.sqrt(5)) // golden angle for even spread
  const maxStars = Math.max(...systems.map((s) => s.stars), 1)

  return systems.map((s, i) => {
    let seed = 0
    for (const c of s.id) seed = (seed * 31 + c.charCodeAt(0)) & 0xffffffff
    const rand = ((seed >>> 0) % 1000) / 1000

    // bigger repos closer to centre; index spreads the rest far outward
    const importance = Math.log10(Math.max(s.stars, 1)) / Math.log10(maxStars)
    const baseR = 18 + i * 6.5
    const radius = baseR * (1.05 - importance * 0.25)
    const angle = i * golden + rand * 0.8
    const y = (rand - 0.5) * 18

    return {
      system: s,
      position: new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius),
    }
  })
}

export default function GalaxyView({ galaxy, onSelectSystem }) {
  const placed = useMemo(() => layoutSystems(galaxy.systems ?? []), [galaxy])

  return (
    <group>
      {/* black hole at the galactic centre (decorative) */}
      <GalaxyCore color={galaxy.color} />
      <ambientLight intensity={0.15} />

      {placed.map(({ system, position }) => (
        <StarSystem
          key={system.id}
          system={system}
          position={position}
          onSelect={onSelectSystem}
        />
      ))}
    </group>
  )
}
