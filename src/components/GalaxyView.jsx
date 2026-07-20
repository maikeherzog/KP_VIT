import { useMemo } from 'react'
import StarSystem from './StarSystem'
import GalaxyCore from './GalaxyCore'
import { layoutSystems } from '../data/galaxyLayout'

export default function GalaxyView({ galaxy, onSelectSystem }) {
  const placed = useMemo(() => layoutSystems(galaxy.systems ?? []), [galaxy])

  return (
    <group>
      {/* black hole at the galactic centre (decorative) */}
      <GalaxyCore color={galaxy.color} />
      {/* stars are self-lit; this fills the planets now that per-star lights are gone */}
      <ambientLight intensity={0.45} />

      {placed.map(({ system, position, starSize }) => (
        <StarSystem
          key={system.id}
          system={system}
          position={position}
          radius={starSize}
          onSelect={onSelectSystem}
        />
      ))}
    </group>
  )
}
