import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import OrbitRing from './OrbitRing'

// Planet archetypes — purely aesthetic variety (the *number* of planets carries
// the data: it's the log tier of the repo's total fork count). Each planet just
// gets a colourful, distinct world type chosen deterministically from its seed.
const PLANET_TYPES = [
  { mode: 'terran',   sea: '#1f6fb2', shallow: '#2f93c7', land: '#3f8a4b', cap: '#eaf2ff' }, // earth
  { mode: 'terran',   sea: '#15487a', shallow: '#1f8fb0', land: '#2f7d6a', cap: '#dff3ff' }, // ocean
  { mode: 'terran',   sea: '#7a4a1f', shallow: '#b07a3a', land: '#caa26a', cap: '#f0e6d0' }, // desert
  { mode: 'terran',   sea: '#4a2a6b', shallow: '#8a3f9c', land: '#7fbf3f', cap: '#e6ffd6' }, // alien
  { mode: 'lava',     rock: '#2a1410', crack: '#ff7a1a', hot: '#ffd36b' },                   // volcanic
  { mode: 'ice',      a: '#cfe6ff', b: '#9cc4e6', cap: '#ffffff' },                          // ice
  { mode: 'bands',    cols: ['#d9a86c', '#b07840', '#e8c79a', '#8a5a3a'] },                  // gas (warm)
  { mode: 'bands',    cols: ['#5a7fb5', '#3f5d8a', '#7fa6cf', '#2e4870'] },                  // gas (cool)
  { mode: 'bands',    cols: ['#b56ab0', '#7a4a9c', '#d79ad0', '#5a3a78'] },                  // gas (violet)
  { mode: 'cratered', a: '#8a8a8f', b: '#54545a' },                                          // rocky moon
  { mode: 'cratered', a: '#9c7b5a', b: '#5e4a38' },                                          // rocky tan
]

const _c = new THREE.Color()
function makePlanetTexture(seed) {
  const W = 32, H = 16
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')
  let s = (seed >>> 0) || 1
  const rng = () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff }

  const t = PLANET_TYPES[seed % PLANET_TYPES.length]
  const bright = 0.82 + rng() * 0.36
  const freq = 0.3 + rng() * 0.5
  const C = {}
  for (const k of Object.keys(t)) if (k !== 'mode' && k !== 'cols') C[k] = new THREE.Color(t[k])
  const bands = t.cols ? t.cols.map((h) => new THREE.Color(h)) : null

  for (let y = 0; y < H; y++) {
    const lat = Math.abs(y / (H - 1) - 0.5) * 2 // 0 equator → 1 pole
    for (let x = 0; x < W; x++) {
      const cont = 0.5 + 0.5 * (Math.sin(x * freq + seed * 0.7) + Math.cos(y * (freq + 0.2) + seed * 0.3)) * 0.32
      const n = Math.max(0, Math.min(1, cont + (rng() - 0.5) * 0.25))

      if (t.mode === 'terran') {
        if (n < 0.5) _c.copy(n < 0.42 ? C.sea : C.shallow)
        else _c.copy(C.land)
        if (lat > 0.84) _c.copy(C.cap)
      } else if (t.mode === 'lava') {
        if (n > 0.62) _c.copy(C.crack).lerp(C.hot, (n - 0.62) / 0.38)
        else _c.copy(C.rock)
      } else if (t.mode === 'ice') {
        _c.copy(n < 0.5 ? C.a : C.b)
        if (n > 0.82) _c.copy(C.cap)
      } else if (t.mode === 'bands') {
        const yy = y / H + Math.sin(x * 0.22 + seed) * 0.05
        const idx = ((Math.floor(yy * bands.length * 1.5) % bands.length) + bands.length) % bands.length
        _c.copy(bands[idx])
      } else { // cratered
        _c.copy(C.a)
        if (rng() < 0.12) _c.copy(C.b)
      }

      _c.multiplyScalar(bright * (0.85 + 0.3 * rng()))
      ctx.fillStyle = `rgb(${_c.r * 255 | 0},${_c.g * 255 | 0},${_c.b * 255 | 0})`
      ctx.fillRect(x, y, 1, 1)
    }
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export default function Planet({
  radius = 0.4,
  color = '#4488ff',
  orbitRadius = 5,
  orbitSpeed = 0.5,
  orbitOffset = 0,
  rotationSpeed = 0.3,
  name,
  stars = 0,
  showLabel = true,
  showOrbit = true,
  onSelect,
  // all extra props (forks, rank, …) forwarded to onSelect
  ...data
}) {
  const groupRef = useRef()
  const planetRef = useRef()
  const angleRef = useRef(orbitOffset)

  const seed = useMemo(() => {
    let h = 0
    for (const c of `${name ?? ''}${orbitOffset}`) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff
    return h >>> 0
  }, [name, orbitOffset])
  const texture = useMemo(() => makePlanetTexture(seed), [seed])

  useFrame((_, delta) => {
    angleRef.current += delta * orbitSpeed
    groupRef.current.position.x = Math.cos(angleRef.current) * orbitRadius
    groupRef.current.position.z = Math.sin(angleRef.current) * orbitRadius
    planetRef.current.rotation.y += delta * rotationSpeed
  })

  return (
    <>
      {showOrbit && <OrbitRing radius={orbitRadius} />}
      <group ref={groupRef}>
        <mesh
          ref={planetRef}
          onClick={(e) => { e.stopPropagation(); onSelect?.({ name, radius, color, stars, orbitRadius, orbitSpeed, ...data }) }}
        >
          <sphereGeometry args={[radius, 24, 24]} />
          <meshStandardMaterial
            map={texture}
            emissive="#ffffff"
            emissiveMap={texture}
            emissiveIntensity={0.32}
            roughness={0.95}
            metalness={0}
          />
        </mesh>

        {name && showLabel && (
          <Html distanceFactor={12} center style={{ pointerEvents: 'none' }}>
            <span style={{
              color: 'rgba(255,255,255,0.6)',
              fontSize: '11px',
              fontFamily: 'monospace',
              whiteSpace: 'nowrap',
              textShadow: '0 0 6px rgba(0,0,0,0.9)',
              transform: 'translateY(-18px)',
              display: 'block',
            }}>
              {name}
            </span>
          </Html>
        )}
      </group>
    </>
  )
}
