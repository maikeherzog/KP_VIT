import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import OrbitRing from './OrbitRing'

export default function Planet({
  radius = 0.4,
  color = '#4488ff',
  emissiveColor,
  orbitRadius = 5,
  orbitSpeed = 0.5,
  orbitOffset = 0,
  rotationSpeed = 0.3,
  name,
  showLabel = true,
  showOrbit = true,
  onSelect,
  // all extra props (stars, forks, rank, …) forwarded to onSelect
  ...data
}) {
  const groupRef = useRef()
  const planetRef = useRef()
  const angleRef = useRef(orbitOffset)

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
          onClick={(e) => { e.stopPropagation(); onSelect?.({ name, radius, color, orbitRadius, orbitSpeed, ...data }) }}
        >
          <sphereGeometry args={[radius, 32, 32]} />
          <meshStandardMaterial
            color={color}
            emissive={emissiveColor ?? color}
            emissiveIntensity={0.15}
            roughness={0.85}
            metalness={0.05}
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
