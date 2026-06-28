// The interface between the world and the LLM narrator.
//
// Given the object currently nearest the ship (a star system / repository, or a
// galaxy / language), this builds a structured context + an LLM-ready prompt.
// The Board Computer UI renders this; later, `requestNarration` will POST the
// prompt to the LLM instead of returning the local template.

import { narrativeFor } from './narrative'

function forkList(planets) {
  if (!planets?.length) return []
  return planets.map((p) => `${p.owner}/${p.name} (${p.stars}★)`)
}

// → { kind, subject, distance, facts, prompt, data }
export function buildNarratorContext({ kind, data, distance, galaxy } = {}) {
  if (!data) return null

  if (kind === 'system') {
    const forks = forkList(data.planets)
    const facts = {
      type: 'repository / star system',
      repository: data.fullName,
      language: data.language ?? galaxy?.name ?? 'unknown',
      stars: data.stars,
      forks: data.forks,
      activity: `${Math.round((data.activity ?? 0) * 100)}%`,
      status: data.habitable ? 'habitable — actively maintained' : 'stale — little recent activity',
      created: data.born ?? 'unknown',
      notableForks: forks.length ? forks : ['none'],
      galaxy: galaxy?.name ?? data.language ?? 'unknown',
    }
    const prompt = [
      'You are the narrator aboard a deep-space exploration vessel. The universe is a metaphor for the open-source world: galaxies are programming languages, stars are repositories, planets are notable forks.',
      `The ship is approaching the star system "${data.fullName}" in the ${facts.galaxy} galaxy.`,
      'Data:',
      `- stars (gravity / popularity): ${data.stars}`,
      `- forks (orbiting worlds): ${data.forks}`,
      `- recent activity (core heat): ${facts.activity}`,
      `- status: ${facts.status}`,
      `- created: ${facts.created}`,
      `- notable forks: ${facts.notableForks.join(', ')}`,
      'Write a short, atmospheric logbook entry (2–3 sentences) describing this world in the space-exploration metaphor.',
    ].join('\n')

    return { kind, subject: data.fullName, distance, facts, prompt, data }
  }

  // kind === 'galaxy'
  const facts = {
    type: 'galaxy / programming language',
    language: data.name,
    born: data.born,
    repositories: data.systemCount ?? 0,
    state: data.dead ? 'extinct — collapsed into a black hole' : 'active',
  }
  const prompt = [
    'You are the narrator aboard a deep-space exploration vessel. Galaxies are programming languages; the further from the centre, the older the language.',
    `The ship is approaching the ${data.name} galaxy (language born ${data.born}, ${facts.repositories} repositories${data.dead ? ', now extinct — a black hole' : ''}).`,
    'Write a short, atmospheric logbook entry (2–3 sentences) about this galaxy in the space-exploration metaphor.',
  ].join('\n')

  return { kind, subject: data.name, distance, facts, prompt, data }
}

// Produces the narration text. TODO: replace the template fallback with a real
// LLM call (POST `context.prompt` to the Anthropic API). Async already, so the
// Board Computer's loading UX is ready for the swap.
export async function requestNarration(context, galaxy) {
  if (!context) return ''

  try {
    const response = await fetch('http://localhost:3000/narrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: context.prompt }),
    })
    const data = await response.json()
    if (data.reply) return data.reply
  } catch (err) {
    console.error('Narration LLM failed, using template:', err)
  }

  // fallback if Ollama/backend is down
  if (context.kind === 'system') return narrativeFor(context.data, galaxy)

  const g = context.data
  const tail = g.dead
    ? 'Its light went out long ago; only a black hole remains where a language once burned.'
    : 'Countless repository-stars wheel through its arms.'
  return `Logbook — entering the ${g.name} galaxy, born ${g.born}. ${tail}`
}
