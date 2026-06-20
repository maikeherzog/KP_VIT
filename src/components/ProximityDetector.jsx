import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

// Finds the target (star system / galaxy) nearest the ship and reports it to the
// Board Computer. Throttled, and only fires onNearby when the nearest object or
// its distance actually changes — keeps React re-renders minimal.
export default function ProximityDetector({ shipPosRef, targets, onNearby, range = 55 }) {
  const acc = useRef(0)
  const last = useRef({ id: null, dist: -1 })

  useFrame((_, delta) => {
    acc.current += delta
    if (acc.current < 0.15) return
    acc.current = 0

    const ship = shipPosRef.current
    if (!ship) return

    let best = null
    let bestD = Infinity
    for (const t of targets) {
      const d = t.position.distanceTo(ship)
      if (d < bestD) { bestD = d; best = t }
    }

    if (best && bestD <= range) {
      const dist = Math.round(bestD)
      if (last.current.id !== best.id || Math.abs(last.current.dist - dist) >= 1) {
        last.current = { id: best.id, dist }
        onNearby({ kind: best.kind, id: best.id, data: best.data, distance: dist })
      }
    } else if (last.current.id !== null) {
      last.current = { id: null, dist: -1 }
      onNearby(null)
    }
  })

  return null
}
