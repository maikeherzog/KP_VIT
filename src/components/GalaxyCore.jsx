import * as THREE from 'three'

// A purely decorative black hole at the centre of a galaxy (no interaction).
// Looks intentionally different from the universe-map black holes: no particle
// accretion disk — just the event horizon and glowing rings, tinted toward the
// galaxy's own colour, and it lights the surrounding star systems.
export default function GalaxyCore({ color = '#88aaff' }) {
  const horizon = 2.6

  return (
    <group>
      {/* event horizon */}
      <mesh>
        <sphereGeometry args={[horizon, 48, 48]} />
        <meshBasicMaterial color="#000000" />
      </mesh>

      {/* photon ring in the disk plane */}
      <mesh rotation={[Math.PI / 2 + 0.55, 0, 0]}>
        <torusGeometry args={[horizon * 1.2, 0.07, 12, 120]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.85} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* vertical lensed halo */}
      <mesh>
        <torusGeometry args={[horizon * 1.26, 0.09, 12, 120]} />
        <meshBasicMaterial color={color} transparent opacity={0.6} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* lights the galaxy's star systems */}
      <pointLight intensity={2.2} distance={260} decay={1.3} color={color} />
      <pointLight intensity={1.2} distance={60} decay={1.6} color="#ffffff" />
    </group>
  )
}
