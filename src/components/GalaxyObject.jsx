import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { galaxyMetaFor } from '../data/languages'

// Generate a flat spiral point cloud (a stylised galaxy disk).
function useSpiralGeometry(count, size, seed) {
  return useMemo(() => {
    const positions = new Float32Array(count * 3)
    const arms = 2
    // deterministic pseudo-random from seed so galaxies look stable
    let s = seed
    const rand = () => {
      s = (s * 1664525 + 1013904223) & 0xffffffff
      return (s >>> 0) / 0xffffffff
    }
    for (let i = 0; i < count; i++) {
      const t = Math.pow(rand(), 0.5)        // bias toward outer radius
      const radius = t * size
      const arm = i % arms
      const angle = t * 6 + (arm / arms) * Math.PI * 2 + (rand() - 0.5) * 0.6
      const spread = (1 - t) * 0.4 + 0.05
      positions[i * 3]     = Math.cos(angle) * radius + (rand() - 0.5) * spread
      positions[i * 3 + 1] = (rand() - 0.5) * spread * 0.6   // thin disk
      positions[i * 3 + 2] = Math.sin(angle) * radius + (rand() - 0.5) * spread
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return geo
  }, [count, size, seed])
}

// The galaxy rests at `fullPosition` while `alive` (its language exists at the
// current timeline year). When it dies (rewound past the birth year) it flies
// briskly into the centre and fades out. Opacity/scale follow the live distance
// to the centre so the fade matches the flight.
const ZERO = new THREE.Vector3(0, 0, 0)

export default function GalaxyObject({ galaxy, fullPosition, alive = true, onSelect }) {
  const outerRef = useRef()
  const spinRef = useRef()
  const coreMat = useRef()
  const pointsMat = useRef()
  const [hovered, setHovered] = useState(false)

  // bigger galaxies (more systems) → larger disk
  const size = 2.2 + Math.min(galaxy.systemCount, 24) * 0.12
  const seed = useMemo(() => {
    let h = 0
    for (const c of galaxy.id) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff
    return h || 1
  }, [galaxy.id])

  const geometry = useSpiralGeometry(900, size, seed)
  const facts = useMemo(() => galaxyMetaFor(galaxy.name ?? galaxy.id), [galaxy.name, galaxy.id])

  const fullVec = useMemo(() => new THREE.Vector3(...fullPosition), [fullPosition])
  const fullDist = useMemo(() => Math.max(fullVec.length(), 0.001), [fullVec])

  // hover only counts while the galaxy is alive (avoids a stuck hover on collapse)
  const showHover = hovered && alive

  useFrame((_, delta) => {
    const o = outerRef.current
    if (!o) return
    // brisk fly toward target: stay at fullPosition while alive, else into centre
    const target = alive ? fullVec : ZERO
    o.position.lerp(target, alive ? 0.12 : 0.18)
    if (spinRef.current) spinRef.current.rotation.y += delta * 0.08

    // appear = how far out the galaxy currently sits (1 = at full extent, 0 = centre)
    const appear = Math.min(1, (o.position.length() / fullDist) / 0.55)
    if (spinRef.current) spinRef.current.scale.setScalar(0.3 + appear * 0.7)
    if (coreMat.current) coreMat.current.opacity = appear
    if (pointsMat.current) pointsMat.current.opacity = 0.9 * appear
  })

  return (
    <group ref={outerRef} position={fullPosition}>
      <group ref={spinRef}>
        {/* bright core */}
        <mesh>
          <sphereGeometry args={[size * 0.12, 16, 16]} />
          <meshBasicMaterial ref={coreMat} color={galaxy.color} transparent opacity={1} />
        </mesh>

        {/* spiral disk */}
        <points geometry={geometry}>
          <pointsMaterial
            ref={pointsMat}
            size={showHover ? 0.18 : 0.13}
            color={galaxy.color}
            transparent
            opacity={0.9}
            sizeAttenuation
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </points>
      </group>

      {/* invisible hit area for reliable clicking/hovering */}
      <mesh
        onClick={(e) => { if (!alive) return; e.stopPropagation(); onSelect?.(galaxy.id) }}
        onPointerOver={(e) => { if (!alive) return; e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer' }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto' }}
      >
        <sphereGeometry args={[size * 0.9, 16, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {alive && (
        <Html distanceFactor={40} center style={{ pointerEvents: 'none' }}>
          <div style={{
            color: showHover ? '#fff' : 'rgba(255,255,255,0.65)',
            opacity: 1,
            fontFamily: 'monospace',
            fontSize: '13px',
            fontWeight: showHover ? 700 : 400,
            whiteSpace: 'nowrap',
            textShadow: '0 0 8px rgba(0,0,0,0.95)',
            transform: `translateY(${size * 14 + 6}px)`,
          }}>
            {galaxy.name}
            <span style={{ opacity: 0.45, marginLeft: 6, fontSize: '11px' }}>
              ·{galaxy.born}
            </span>
          </div>
        </Html>
      )}

      {/* Detailed hover card — fixed pixel size, floats up-right of the galaxy */}
      {showHover && (
        <Html
          center={false}
          zIndexRange={[100, 0]}
          style={{ pointerEvents: 'none' }}
          wrapperClass="galaxy-tooltip"
        >
          <div style={{
            transform: 'translate(18px, -50%)',
            width: 232,
            background: 'rgba(8,10,16,0.88)',
            border: `1px solid ${galaxy.color}66`,
            borderRadius: 12,
            padding: '12px 14px',
            fontFamily: 'monospace',
            color: '#fff',
            backdropFilter: 'blur(6px)',
            boxShadow: `0 0 22px ${galaxy.color}33`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{
                width: 10, height: 10, borderRadius: '50%',
                background: galaxy.color, flexShrink: 0,
                boxShadow: `0 0 8px ${galaxy.color}`,
              }} />
              <span style={{ fontWeight: 700, fontSize: 15 }}>{galaxy.name}</span>
              <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: 11 }}>
                est. {galaxy.born}
              </span>
            </div>

            <div style={{
              fontSize: 12, lineHeight: 1.4, opacity: 0.8,
              marginBottom: 10, fontStyle: 'italic',
            }}>
              {facts.blurb}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 10px', fontSize: 11 }}>
              <span style={{ opacity: 0.45 }}>repositories</span>
              <span style={{ color: galaxy.color, fontWeight: 700 }}>
                {galaxy.systemCount} star systems
              </span>
              <span style={{ opacity: 0.45 }}>paradigm</span>
              <span style={{ opacity: 0.85 }}>{facts.paradigm}</span>
              <span style={{ opacity: 0.45 }}>designer</span>
              <span style={{ opacity: 0.85 }}>{facts.designer}</span>
              <span style={{ opacity: 0.45 }}>typing</span>
              <span style={{ opacity: 0.85 }}>{facts.typing}</span>
            </div>

            <div style={{ marginTop: 9, fontSize: 10, opacity: 0.4 }}>
              click to enter galaxy →
            </div>
          </div>
        </Html>
      )}
    </group>
  )
}
