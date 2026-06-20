import { useMemo } from 'react'
import GalaxyObject from './GalaxyObject'
import BlackHole from './BlackHole'
import Singularity from './Singularity'
import { galaxyPosition } from '../data/languages'

export default function Universe({ galaxies, onSelectGalaxy, year }) {
  // Each galaxy holds its full position while its language already exists
  // (year > born). Once the timeline rewinds past the birth year it is no
  // longer "alive" and flies into the singularity (handled in GalaxyObject).
  const placed = useMemo(
    () => galaxies.map((g) => ({
      galaxy: g,
      fullPosition: galaxyPosition(g),
      alive: year == null ? true : year > g.born,
    })),
    [galaxies, year],
  )

  return (
    <group>
      <Singularity />

      {placed.map(({ galaxy, fullPosition, alive }) =>
        galaxy.dead ? (
          <BlackHole
            key={galaxy.id}
            galaxy={galaxy}
            fullPosition={fullPosition}
            alive={alive}
          />
        ) : (
          <GalaxyObject
            key={galaxy.id}
            galaxy={galaxy}
            fullPosition={fullPosition}
            alive={alive}
            onSelect={onSelectGalaxy}
          />
        )
      )}
    </group>
  )
}
