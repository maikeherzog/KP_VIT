import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useKeyboardControls } from '@react-three/drei'
import * as THREE from 'three'
import SpaceShip from './models/Optimized'

const ACCELERATION  = 10    // units/s² — thrust force
const DRAG          = 1.8   // exponential drag coefficient
const MAX_SPEED     = 18    // units/s
const TURN_SPEED    = 1.4   // rad/s for yaw
const PITCH_SPEED   = 1.0   // rad/s for pitch
const PITCH_LIMIT   = 1.3   // clamp pitch (prevents gimbal flip)
const BANK_MAX      = 0.35  // max roll angle when turning
const BANK_SMOOTH   = 6     // how fast banking interpolates
const CHASE_DIST    = 6
const CHASE_HEIGHT  = 1.8
const CAM_LERP      = 0.07

const _fwd    = new THREE.Vector3()
const _camPos = new THREE.Vector3()
const _lookAt = new THREE.Vector3()

export default function ShipCamera({ onSpeedChange }) {
  const groupRef = useRef()
  const { camera } = useThree()

  const yaw      = useRef(0)
  const pitch    = useRef(0)
  const bank     = useRef(0)
  const pos      = useRef(new THREE.Vector3(0, 2, 18))
  const velocity = useRef(new THREE.Vector3())

  const [, getKeys] = useKeyboardControls()

  useFrame((_, delta) => {
    const { forward, backward, left, right, pitchUp, pitchDown } = getKeys()

    // --- Rotation (instant, no momentum — feels more responsive) ---
    if (left)       yaw.current   += TURN_SPEED  * delta
    if (right)      yaw.current   -= TURN_SPEED  * delta
    if (pitchUp)    pitch.current += PITCH_SPEED * delta
    if (pitchDown)  pitch.current -= PITCH_SPEED * delta
    pitch.current = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch.current))

    // Banking: smooth lerp toward target roll
    const bankTarget = (right ? -1 : left ? 1 : 0) * BANK_MAX
    bank.current += (bankTarget - bank.current) * Math.min(1, BANK_SMOOTH * delta)

    // --- Forward vector (accounts for both yaw + pitch) ---
    _fwd.set(
      -Math.sin(yaw.current) * Math.cos(pitch.current),
       Math.sin(pitch.current),
      -Math.cos(yaw.current) * Math.cos(pitch.current)
    )

    // --- Thrust → velocity ---
    if (forward)  velocity.current.addScaledVector(_fwd,  ACCELERATION * delta)
    if (backward) velocity.current.addScaledVector(_fwd, -ACCELERATION * delta)

    // Exponential drag
    velocity.current.multiplyScalar(Math.max(0, 1 - DRAG * delta))

    // Speed cap
    const speed = velocity.current.length()
    if (speed > MAX_SPEED) velocity.current.multiplyScalar(MAX_SPEED / speed)

    // Notify parent of current speed (for HUD)
    onSpeedChange?.(speed)

    // --- Integrate position ---
    pos.current.addScaledVector(velocity.current, delta)

    // --- Ship mesh ---
    if (groupRef.current) {
      groupRef.current.position.copy(pos.current)
      // -π/2 offsets internal mesh rotation so nose → -Z; pitch tilts vertically; bank rolls
      groupRef.current.rotation.set(-Math.PI / 2 + pitch.current, yaw.current, bank.current)
    }

    // --- Chase camera ---
    _camPos
      .copy(pos.current)
      .addScaledVector(_fwd, -CHASE_DIST)
    _camPos.y += CHASE_HEIGHT

    camera.position.lerp(_camPos, CAM_LERP)

    _lookAt.copy(pos.current).addScaledVector(_fwd, 6)
    camera.lookAt(_lookAt)
  })

  return (
    <group ref={groupRef}>
      <SpaceShip scale={0.28} />
    </group>
  )
}
