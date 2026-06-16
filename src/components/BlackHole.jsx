import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { deadMeta } from '../data/languages'

const ZERO = new THREE.Vector3(0, 0, 0)

// Accretion disk as a flat annulus of particles, coloured hot (white-gold) near
// the horizon → cooler orange at the rim. Same particle aesthetic as the galaxies.
function useAccretionDisk(seed, inner, outer) {
  return useMemo(() => {
    const count = 1600
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    let s = seed
    const rand = () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff }

    const hot = new THREE.Color('#fff3d6')
    const cool = new THREE.Color('#ff7a18')
    const c = new THREE.Color()

    for (let i = 0; i < count; i++) {
      const t = Math.pow(rand(), 0.6)               // denser toward the inside
      const r = inner + t * (outer - inner)
      const ang = rand() * Math.PI * 2
      const flare = (r / outer) * 0.18              // disk flares slightly at the rim
      positions[i * 3]     = Math.cos(ang) * r
      positions[i * 3 + 1] = (rand() - 0.5) * flare
      positions[i * 3 + 2] = Math.sin(ang) * r

      c.copy(hot).lerp(cool, t)
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return geo
  }, [seed, inner, outer])
}

export default function BlackHole({ galaxy, fullPosition, alive = true }) {
  const outerRef = useRef()
  const diskRef = useRef()
  const [hovered, setHovered] = useState(false)

  const seed = useMemo(() => {
    let h = 0
    for (const c of galaxy.id) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff
    return h || 1
  }, [galaxy.id])

  const horizon = 1.0
  const disk = useAccretionDisk(seed, horizon * 1.35, horizon * 4.2)
  const facts = useMemo(() => deadMeta(galaxy.id) ?? {}, [galaxy.id])

  const fullVec = useMemo(() => new THREE.Vector3(...fullPosition), [fullPosition])
  const fullDist = useMemo(() => Math.max(fullVec.length(), 0.001), [fullVec])
  const showHover = hovered && alive

  useFrame((_, delta) => {
    const o = outerRef.current
    if (!o) return
    o.position.lerp(alive ? fullVec : ZERO, alive ? 0.12 : 0.18)
    if (diskRef.current) diskRef.current.rotation.y += delta * 0.6   // fast inner orbit
    const appear = Math.min(1, (o.position.length() / fullDist) / 0.55)
    o.scale.setScalar(0.3 + appear * 0.7)
  })

  return (
    <group ref={outerRef} position={fullPosition}>
      {/* event horizon — pure black sphere that occludes the disk behind it */}
      <mesh>
        <sphereGeometry args={[horizon, 48, 48]} />
        <meshBasicMaterial color="#000000" />
      </mesh>

      {/* flat accretion disk */}
      <points ref={diskRef} geometry={disk} rotation={[0.32, 0, 0]}>
        <pointsMaterial
          size={0.085}
          vertexColors
          transparent
          opacity={0.95}
          sizeAttenuation
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      {/* photon ring in the disk plane */}
      <mesh rotation={[Math.PI / 2 + 0.32, 0, 0]}>
        <torusGeometry args={[horizon * 1.18, 0.035, 12, 96]} />
        <meshBasicMaterial color="#ffe6b0" transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* lensed halo — the vertical ring arcing over the top/bottom (Interstellar look) */}
      <mesh>
        <torusGeometry args={[horizon * 1.22, 0.05, 12, 96]} />
        <meshBasicMaterial color="#ffd9a0" transparent opacity={0.55} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* faint glow */}
      <pointLight intensity={1.4} distance={20} decay={1.8} color="#ff9a3c" />

      {/* invisible hover target */}
      <mesh
        onPointerOver={(e) => { if (!alive) return; e.stopPropagation(); setHovered(true); document.body.style.cursor = 'help' }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto' }}
      >
        <sphereGeometry args={[horizon * 4.4, 16, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {alive && (
        <Html distanceFactor={40} center style={{ pointerEvents: 'none' }}>
          <div style={{
            color: showHover ? '#fff' : 'rgba(255,200,150,0.7)',
            fontFamily: 'monospace',
            fontSize: '13px',
            fontWeight: showHover ? 700 : 400,
            whiteSpace: 'nowrap',
            textShadow: '0 0 8px rgba(0,0,0,0.95)',
            transform: 'translateY(78px)',
          }}>
            {galaxy.name}
            <span style={{ opacity: 0.5, marginLeft: 6, fontSize: '11px' }}>· extinct</span>
          </div>
        </Html>
      )}

      {showHover && (
        <Html center={false} zIndexRange={[100, 0]} style={{ pointerEvents: 'none' }} wrapperClass="blackhole-tooltip">
          <div style={{
            transform: 'translate(20px, -50%)',
            width: 238,
            background: 'rgba(8,6,10,0.9)',
            border: '1px solid rgba(255,150,60,0.35)',
            borderRadius: 12,
            padding: '12px 14px',
            fontFamily: 'monospace',
            color: '#fff',
            backdropFilter: 'blur(6px)',
            boxShadow: '0 0 22px rgba(255,140,40,0.25)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#000', border: '1px solid #ff9a3c', flexShrink: 0 }} />
              <span style={{ fontWeight: 700, fontSize: 15 }}>{galaxy.name}</span>
              <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: 11 }}>est. {galaxy.born}</span>
            </div>
            <div style={{ fontSize: 11, letterSpacing: 1, opacity: 0.55, marginBottom: 8 }}>★ BLACK HOLE · EXTINCT LANGUAGE</div>
            <div style={{ fontSize: 12, lineHeight: 1.4, opacity: 0.8, marginBottom: 10, fontStyle: 'italic' }}>{facts.blurb}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 10px', fontSize: 11 }}>
              <span style={{ opacity: 0.45 }}>paradigm</span><span style={{ opacity: 0.85 }}>{facts.paradigm}</span>
              <span style={{ opacity: 0.45 }}>designer</span><span style={{ opacity: 0.85 }}>{facts.designer}</span>
              <span style={{ opacity: 0.45 }}>typing</span><span style={{ opacity: 0.85 }}>{facts.typing}</span>
            </div>
          </div>
        </Html>
      )}
    </group>
  )
}
