// Deterministic "spacelog" narrative generator.
//
// Phase 2 ships a template-based log so the narrative panel works immediately
// with zero API key. A later build-time step (scripts/narrate.mjs) can fill a
// `system.narrative` field with a real LLM-written log; if that field exists it
// takes precedence (see narrativeFor).

function formatStars(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} million`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`
  return String(n)
}

// pick a deterministic variant from a list, seeded by the repo id
function pick(list, seed) {
  let h = 0
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff
  return list[Math.abs(h) % list.length]
}

export function buildNarrative(system, galaxy) {
  if (system.narrative) return system.narrative // pre-generated LLM text wins

  const lang = galaxy?.name ?? system.language ?? 'unknown'
  const stars = formatStars(system.stars)
  const heat = system.activity > 0.8 ? 'blazing' : system.activity > 0.4 ? 'steady' : 'dim'

  const openers = [
    `Drifting into the ${lang} galaxy, the ship's sensors lock onto ${system.name}.`,
    `We approach ${system.fullName}, a beacon in the ${lang} galaxy.`,
    `Course set for ${system.name} — one of the brighter stars of ${lang}.`,
  ]

  const body = system.habitable
    ? [
        `Its surface glows with ${stars} stars of accumulated gravity, and the core still burns ${heat} — commits and releases keep the fusion alive. A habitable world: warm, growing, well-tended.`,
        `Gravitational pull of ${stars} stars holds a busy system together. Activity readings are ${heat}; this is a living, maintained world where new orbits still form.`,
      ]
    : [
        `Once-bright, the star now burns ${heat}. ${stars} stars of legacy gravity remain, but the surface has cooled — little recent activity reaches our instruments. A world drifting toward dormancy.`,
        `${stars} stars of mass linger, yet the core has gone ${heat}. Few new signals; this system has aged past its prime, a quiet relic of the ${lang} galaxy.`,
      ]

  const forks = system.planets?.length
    ? ` ${system.planets.length} fork-world${system.planets.length > 1 ? 's' : ''} trace lazy orbits around it.`
    : ' No notable forks orbit this lonely star.'

  return `${pick(openers, system.id)} ${pick(body, system.id + 'b')}${forks}`
}

export function narrativeFor(system, galaxy) {
  return buildNarrative(system, galaxy)
}
