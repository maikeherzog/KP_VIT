import { useMemo } from 'react'
import * as THREE from 'three'

export default function OrbitRing({ radius }) {
  const points = useMemo(() => {
    const pts = []
    const segments = 128
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2
      pts.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius))
    }
    return pts
  }, [radius])

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry().setFromPoints(points)
    return geo
  }, [points])

  return (
    <lineLoop geometry={geometry}>
      <lineBasicMaterial color="#4a6fa5" opacity={0.25} transparent />
    </lineLoop>
  )
}
