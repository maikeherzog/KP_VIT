import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// A small, constantly shimmering "big bang" point at the universe centre.
// Its size does NOT react to galaxies collapsing into it — it just wobbles.
export default function Singularity() {
  const coreRef = useRef()
  const haloRef = useRef()

  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (coreRef.current) {
      // non-uniform pulse on each axis → a wobbling, undulating blob
      coreRef.current.scale.set(
        1 + 0.18 * Math.sin(t * 2.0),
        1 + 0.18 * Math.sin(t * 2.3 + 1),
        1 + 0.18 * Math.sin(t * 1.7 + 2),
      )
      coreRef.current.rotation.y = t * 0.3
      coreRef.current.rotation.x = t * 0.17
    }
    if (haloRef.current) {
      const p = 0.5 + 0.5 * Math.sin(t * 1.5)
      haloRef.current.material.opacity = 0.10 + p * 0.12
      haloRef.current.scale.setScalar(1.3 + p * 0.25)
    }
  })

  return (
    <group>
      <pointLight intensity={2.4} distance={120} decay={1.5} color="#ffffff" />

      {/* tiny wobbling core */}
      <mesh ref={coreRef}>
        <icosahedronGeometry args={[0.45, 1]} />
        <meshBasicMaterial color="#fff6e0" />
      </mesh>

      {/* faint pulsing halo */}
      <mesh ref={haloRef}>
        <sphereGeometry args={[0.7, 16, 16]} />
        <meshBasicMaterial
          color="#9fc4ff"
          transparent
          opacity={0.16}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}
