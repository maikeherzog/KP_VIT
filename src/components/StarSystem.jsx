import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import Planet from './Planet'

const CURRENT_YEAR = new Date().getFullYear()

// Age-based colour: a young repo burns warm gold; as it ages the star fades
// toward a pale blue-white "white dwarf". (Brightness is driven separately by
// recent activity, size by star count.)
const STAR_RAMP = [
  [0,  new THREE.Color('#ffc24d')], // young — warm gold
  [4,  new THREE.Color('#ffe9b8')], // maturing — warm white
  [9,  new THREE.Color('#f2f5ff')], // aging — white
  [18, new THREE.Color('#b4ccff')], // white dwarf — pale blue-white
]
function starColor(born) {
  const age = Math.max(0, CURRENT_YEAR - (born ?? CURRENT_YEAR))
  if (age <= STAR_RAMP[0][0]) return STAR_RAMP[0][1].clone()
  for (let i = 1; i < STAR_RAMP.length; i++) {
    if (age <= STAR_RAMP[i][0]) {
      const t = (age - STAR_RAMP[i - 1][0]) / (STAR_RAMP[i][0] - STAR_RAMP[i - 1][0])
      return STAR_RAMP[i - 1][1].clone().lerp(STAR_RAMP[i][1], t)
    }
  }
  return STAR_RAMP[STAR_RAMP.length - 1][1].clone()
}

// star radius from star_count (log compressed) — ~0.4 (small) → ~3.0 (mega-repo)
function starRadius(stars) {
  return 0.4 + Math.min(1, Math.log10(Math.max(stars, 1)) / 5.4) * 2.6
}

// deterministic RNG seeded from a string (stable layout per repo/fork)
function rngFromString(str) {
  let s = 0
  for (const c of String(str)) s = (s * 31 + c.charCodeAt(0)) & 0xffffffff
  s = (s >>> 0) || 1
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff }
}

// Procedural pixel "sun" texture: a low-res, nearest-filtered canvas of blotchy
// warm/cool cells with the odd darker sunspot.
function makeStarTexture(baseColor, seed) {
  const size = 28
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const base = new THREE.Color(baseColor)
  const highlight = new THREE.Color('#fff7e0')
  const tmp = new THREE.Color()
  let s = (seed >>> 0) || 1
  const rand = () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const wave = 0.5 + 0.25 * (Math.sin(x * 0.6) + Math.cos(y * 0.55))
      let b = 0.55 + 0.45 * (0.5 * wave + 0.5 * rand())
      if (rand() < 0.05) b *= 0.45              // sunspots
      b = Math.max(0.2, Math.min(1.3, b))
      tmp.copy(base).multiplyScalar(b)
      if (b > 1.05) tmp.lerp(highlight, 0.5)    // bright flares
      ctx.fillStyle = `rgb(${Math.min(255, tmp.r * 255) | 0},${Math.min(255, tmp.g * 255) | 0},${Math.min(255, tmp.b * 255) | 0})`
      ctx.fillRect(x, y, 1, 1)
    }
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export default function StarSystem({ system, position, onSelect }) {
  const coreRef = useRef()
  const [hovered, setHovered] = useState(false)

  const radius = starRadius(system.stars)
  const color = useMemo(() => starColor(system.born), [system.born])
  const emissiveIntensity = 0.5 + system.activity * 1.8

  const seedNum = useMemo(() => {
    let h = 0
    for (const c of system.id) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff
    return h >>> 0
  }, [system.id])

  const texture = useMemo(() => makeStarTexture(color, seedNum), [color, seedNum])

  // Number of planets is a log tier of the total fork count (each 10× = one more
  // planet): <10 forks → 0, 10–99 → 1, 100s → 2, 1k → 3, 10k → 4, 100k+ → 5.
  // We show that many of the top forks (by stars) — each keeps its own
  // star-count-driven look, so count = magnitude, appearance = the fork itself.
  const planets = useMemo(() => {
    const forks = system.planets ?? []
    const tier = system.forks > 0 ? Math.floor(Math.log10(system.forks)) : 0
    const count = Math.max(0, Math.min(tier, forks.length))
    return forks.slice(0, count).map((fork) => {
      const rng = rngFromString(fork.id || fork.name || 'fork')
      const pr = 0.12 + rng() * 0.22 // size is aesthetic variety only — no per-fork data claim
      const dir = rng() < 0.5 ? 1 : -1
      return {
        ...fork,
        radius: pr,
        orbitRadius: radius + 1.2 + rng() * 5 + pr * 2,
        orbitSpeed: (0.12 + rng() * 0.4) * dir,
        orbitOffset: rng() * Math.PI * 2,
        rotationSpeed: 0.2 + rng() * 0.5,
        color: '#9fb4d0',
        tilt: [(rng() - 0.5) * 1.0, rng() * Math.PI * 2, (rng() - 0.5) * 1.0],
      }
    })
  }, [system.planets, system.forks, radius])

  useFrame((_, delta) => {
    if (coreRef.current) coreRef.current.rotation.y += delta * 0.15
  })

  return (
    <group position={position}>
      {/* No per-star light — the star is self-lit (emissive) so 100+ systems
          stay performant. Planets are lit by the galaxy core + ambient. */}
      <mesh
        ref={coreRef}
        onClick={(e) => { e.stopPropagation(); onSelect?.(system) }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer' }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto' }}
      >
        <sphereGeometry args={[radius, 40, 40]} />
        <meshStandardMaterial
          map={texture}
          emissive="#ffffff"
          emissiveMap={texture}
          emissiveIntensity={emissiveIntensity}
          roughness={1}
          metalness={0}
          toneMapped={false}
        />
      </mesh>

      {/* notable forks orbiting on randomised, inclined orbits */}
      {planets.map((p) => (
        <group key={p.id} rotation={p.tilt}>
          <Planet {...p} showLabel={false} showOrbit rotationSpeed={p.rotationSpeed} onSelect={() => onSelect?.(system)} />
        </group>
      ))}

      {hovered && (
        <Html distanceFactor={18} center style={{ pointerEvents: 'none' }}>
          <div style={{
            color: '#fff',
            fontFamily: 'monospace',
            fontSize: '12px',
            whiteSpace: 'nowrap',
            textShadow: '0 0 8px rgba(0,0,0,0.95)',
            transform: `translateY(-${radius * 26 + 10}px)`,
          }}>
            {system.fullName}
          </div>
        </Html>
      )}
    </group>
  )
}
