import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

export default function Sun({ radius = 1.8, color = '#FDB813' }) {
  const meshRef = useRef()

  useFrame((_, delta) => {
    meshRef.current.rotation.y += delta * 0.05
  })

  return (
    <group>
      <pointLight intensity={3} distance={80} decay={1.2} color="#fff8e7" />
      <mesh ref={meshRef}>
        <sphereGeometry args={[radius, 48, 48]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={1.5}
          roughness={1}
          metalness={0}
        />
      </mesh>
    </group>
  )
}
