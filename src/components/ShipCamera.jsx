import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useKeyboardControls } from '@react-three/drei'
import * as THREE from 'three'
import SpaceShip from './models/Optimized'

const ACCELERATION = 9     // units/s²
const DRAG         = 1.8    // exponential drag
const MAX_SPEED    = 18     // units/s
const TURN_SPEED   = 1.5    // rad/s (yaw)
const PITCH_SPEED  = 1.1    // rad/s

const _worldY = new THREE.Vector3(0, 1, 0)
const _right  = new THREE.Vector3()
const _fwd    = new THREE.Vector3()
const _dq     = new THREE.Quaternion()
const _delta  = new THREE.Vector3()

// Flies the ship with WASD/QE and lets the camera orbit freely around it:
// instead of driving the camera directly, it just keeps the OrbitControls
// target glued to the ship, so the user can rotate/zoom the view like outside.
export default function ShipController({ controlsRef, shipPosRef }) {
  const { camera } = useThree()
  const groupRef = useRef()
  const orient   = useRef(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0)))
  const pos      = useRef(new THREE.Vector3(0, 2, 18))
  const velocity = useRef(new THREE.Vector3())

  const [, getKeys] = useKeyboardControls()

  useFrame((_, delta) => {
    const { forward, backward, left, right, pitchUp, pitchDown } = getKeys()

    // yaw around world-Y keeps the horizon level
    const yawRate = (left ? 1 : right ? -1 : 0) * TURN_SPEED * delta
    if (yawRate) { _dq.setFromAxisAngle(_worldY, yawRate); orient.current.premultiply(_dq) }

    // pitch around the ship's current right axis
    _right.set(1, 0, 0).applyQuaternion(orient.current)
    const pitchRate = (pitchUp ? 1 : pitchDown ? -1 : 0) * PITCH_SPEED * delta
    if (pitchRate) { _dq.setFromAxisAngle(_right, pitchRate); orient.current.premultiply(_dq) }
    orient.current.normalize()

    // ship nose (group +Z) points forward in world space
    _fwd.set(0, 0, 1).applyQuaternion(orient.current)

    if (forward)  velocity.current.addScaledVector(_fwd,  ACCELERATION * delta)
    if (backward) velocity.current.addScaledVector(_fwd, -ACCELERATION * delta)
    velocity.current.multiplyScalar(Math.max(0, 1 - DRAG * delta))
    const speed = velocity.current.length()
    if (speed > MAX_SPEED) velocity.current.multiplyScalar(MAX_SPEED / speed)
    pos.current.addScaledVector(velocity.current, delta)

    if (groupRef.current) {
      groupRef.current.position.copy(pos.current)
      groupRef.current.quaternion.copy(orient.current)
    }
    if (shipPosRef) shipPosRef.current.copy(pos.current)  // share ship position

    // Third-person follow: translate the camera by the same delta the ship
    // moved, then move the orbit target onto the ship. This glues the camera to
    // the ship at a constant offset while the user can still drag to rotate and
    // scroll to zoom around it.
    const c = controlsRef?.current
    if (c) {
      _delta.copy(pos.current).sub(c.target)
      camera.position.add(_delta)
      c.target.copy(pos.current)
      c.update()
    }
  })

  return (
    <group ref={groupRef}>
      <SpaceShip scale={0.07} />
      <pointLight position={[0, 1.5, -3]} intensity={2.5} distance={10} decay={1.6} color="#cce8ff" />
    </group>
  )
}
