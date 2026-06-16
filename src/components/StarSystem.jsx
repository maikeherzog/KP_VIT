import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import Planet from './Planet'

// Warm palette = habitable (actively maintained); cool/blue = stale.
const WARM = new THREE.Color('#ffd27a')
const COOL = new THREE.Color('#5a7fb5')

// star radius from star_count (log compressed)
function starRadius(stars) {
  return 0.35 + Math.min(1.4, Math.log10(Math.max(stars, 1)) / 6 * 1.4)
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
  const color = system.habitable ? WARM : COOL
  const emissiveIntensity = 0.5 + system.activity * 1.8

  const seedNum = useMemo(() => {
    let h = 0
    for (const c of system.id) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff
    return h >>> 0
  }, [system.id])

  const texture = useMemo(() => makeStarTexture(color, seedNum), [color, seedNum])

  // randomised, inclined orbits so forks look like a real planetary system
  const planets = useMemo(() => {
    return (system.planets ?? []).map((fork) => {
      const rng = rngFromString(fork.id || fork.name || 'fork')
      const pr = 0.1 + Math.min(0.3, Math.log10(Math.max(fork.stars, 1)) / 5 * 0.3)
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
  }, [system.planets, radius])

  useFrame((_, delta) => {
    if (coreRef.current) coreRef.current.rotation.y += delta * 0.15
  })

  return (
    <group position={position}>
      <pointLight intensity={system.activity * 2 + 0.3} distance={14} decay={1.6} color={color} />
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
