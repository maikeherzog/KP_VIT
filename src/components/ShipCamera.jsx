import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useKeyboardControls } from '@react-three/drei'
import * as THREE from 'three'
import SpaceShip from './models/Optimized'

const ACCELERATION = 10    // units/s²
const DRAG         = 1.8   // exponential drag
const MAX_SPEED    = 18    // units/s
const TURN_SPEED   = 1.4   // rad/s
const PITCH_SPEED  = 1.0   // rad/s
const BANK_MAX     = 0.35  // visual roll angle (rad)
const BANK_SMOOTH  = 6     // lerp speed
const CHASE_DIST   = 6
const CHASE_HEIGHT = 1.8
const CAM_LERP     = 0.07

// Reusable objects — never allocate inside useFrame
const _worldY    = new THREE.Vector3(0, 1, 0)
const _shipRight = new THREE.Vector3()
const _shipFwd   = new THREE.Vector3()
const _dq        = new THREE.Quaternion()
const _camPos    = new THREE.Vector3()
const _lookAt    = new THREE.Vector3()

export default function ShipCamera({ onSpeedChange }) {
  const groupRef = useRef()
  const { camera } = useThree()

  // Single source of truth: quaternion orientation.
  // Base = π around Y so the ship's nose (+Z in group space) points world -Z.
  const orient   = useRef(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0)))
  const pos      = useRef(new THREE.Vector3(0, 2, 18))
  const velocity = useRef(new THREE.Vector3())
  const bank     = useRef(0)

  const [, getKeys] = useKeyboardControls()

  useFrame((_, delta) => {
    const { forward, backward, left, right, pitchUp, pitchDown } = getKeys()

    // Yaw: rotate around stable world-Y so the horizon stays level
    const yawRate = (left ? 1 : right ? -1 : 0) * TURN_SPEED * delta
    if (yawRate !== 0) {
      _dq.setFromAxisAngle(_worldY, yawRate)
      orient.current.premultiply(_dq)  // world-space rotation applied before orient
    }

    // Pitch: rotate around the ship's *current* local right axis
    // Computing right in world space first, then premultiplying applies it correctly
    _shipRight.set(1, 0, 0).applyQuaternion(orient.current)
    const pitchRate = (pitchUp ? 1 : pitchDown ? -1 : 0) * PITCH_SPEED * delta
    if (pitchRate !== 0) {
      _dq.setFromAxisAngle(_shipRight, pitchRate)
      orient.current.premultiply(_dq)
    }

    orient.current.normalize() // prevent floating-point drift

    // Forward = direction the nose (+Z group space) points in world
    _shipFwd.set(0, 0, 1).applyQuaternion(orient.current)

    // Visual bank: smooth roll around forward axis (does not affect physics)
    const bankTarget = (right ? 1 : left ? -1 : 0) * BANK_MAX
    bank.current += (bankTarget - bank.current) * Math.min(1, BANK_SMOOTH * delta)

    // Thrust
    if (forward)  velocity.current.addScaledVector(_shipFwd,  ACCELERATION * delta)
    if (backward) velocity.current.addScaledVector(_shipFwd, -ACCELERATION * delta)

    velocity.current.multiplyScalar(Math.max(0, 1 - DRAG * delta))
    const speed = velocity.current.length()
    if (speed > MAX_SPEED) velocity.current.multiplyScalar(MAX_SPEED / speed)
    onSpeedChange?.(speed)

    pos.current.addScaledVector(velocity.current, delta)

    // Mesh: base orientation + bank roll around forward axis
    if (groupRef.current) {
      groupRef.current.position.copy(pos.current)
      _dq.setFromAxisAngle(_shipFwd, bank.current)
      groupRef.current.quaternion.copy(orient.current).premultiply(_dq)
    }

    // Chase camera
    _camPos.copy(pos.current).addScaledVector(_shipFwd, -CHASE_DIST)
    _camPos.y += CHASE_HEIGHT
    camera.position.lerp(_camPos, CAM_LERP)

    _lookAt.copy(pos.current).addScaledVector(_shipFwd, 6)
    camera.lookAt(_lookAt)
  })

  return (
    <group ref={groupRef}>
      <SpaceShip scale={0.28} />
      <pointLight position={[0, 3, -10]} intensity={6} distance={25} decay={1.5} color="#cce8ff" />
    </group>
  )
}