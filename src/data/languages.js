// Static language metadata — single source of truth shared by the build-time
// enrichment script (scripts/enrich.mjs) and the runtime fallback.
//
// `born` = year the language first appeared → drives distance from the universe
// centre (older languages sit further out). `color` = canonical language colour.

export const LANGUAGE_META = {
  c: {
    name: 'C', color: '#555555', born: 1972,
    paradigm: 'Procedural, imperative', designer: 'Dennis Ritchie', typing: 'Static, weak',
    blurb: 'The lingua franca of systems programming — close to the metal, everywhere.',
  },
  'c++': {
    name: 'C++', color: '#F34B7D', born: 1985,
    paradigm: 'Multi-paradigm (OOP, generic)', designer: 'Bjarne Stroustrup', typing: 'Static',
    blurb: 'C with zero-cost abstractions: objects, templates and performance.',
  },
  python: {
    name: 'Python', color: '#3776AB', born: 1991,
    paradigm: 'Multi-paradigm', designer: 'Guido van Rossum', typing: 'Dynamic, strong',
    blurb: 'Readable, batteries-included — the default language of data & AI.',
  },
  java: {
    name: 'Java', color: '#B07219', born: 1995,
    paradigm: 'Object-oriented', designer: 'James Gosling (Sun)', typing: 'Static',
    blurb: 'Write once, run anywhere — the JVM workhorse of enterprise software.',
  },
  javascript: {
    name: 'JavaScript', color: '#F7DF1E', born: 1995,
    paradigm: 'Multi-paradigm, event-driven', designer: 'Brendan Eich', typing: 'Dynamic, weak',
    blurb: 'The language of the web, designed in ten days, now runs everywhere.',
  },
  php: {
    name: 'PHP', color: '#8993BE', born: 1995,
    paradigm: 'Imperative, OOP', designer: 'Rasmus Lerdorf', typing: 'Dynamic',
    blurb: 'Powers a huge slice of the web — from WordPress to Wikipedia.',
  },
  ruby: {
    name: 'Ruby', color: '#CC342D', born: 1995,
    paradigm: 'Object-oriented', designer: 'Yukihiro Matsumoto', typing: 'Dynamic, strong',
    blurb: 'Optimised for developer happiness — elegant, expressive, Rails-famous.',
  },
  'c#': {
    name: 'C#', color: '#178600', born: 2000,
    paradigm: 'Multi-paradigm (OOP)', designer: 'Anders Hejlsberg (Microsoft)', typing: 'Static',
    blurb: 'Microsoft’s flagship .NET language — games, apps and services.',
  },
  scala: {
    name: 'Scala', color: '#C22D40', born: 2004,
    paradigm: 'Object-functional', designer: 'Martin Odersky', typing: 'Static',
    blurb: 'Fuses OOP and functional programming on the JVM.',
  },
  go: {
    name: 'Go', color: '#00ADD8', born: 2009,
    paradigm: 'Concurrent, imperative', designer: 'Google (Pike, Thompson, Griesemer)', typing: 'Static',
    blurb: 'Simple, fast and built for concurrency — the cloud-native language.',
  },
  rust: {
    name: 'Rust', color: '#DEA584', born: 2010,
    paradigm: 'Multi-paradigm, systems', designer: 'Graydon Hoare (Mozilla)', typing: 'Static, strong',
    blurb: 'Memory safety without a garbage collector — fearless concurrency.',
  },
  kotlin: {
    name: 'Kotlin', color: '#A97BFF', born: 2011,
    paradigm: 'Object-functional', designer: 'JetBrains', typing: 'Static',
    blurb: 'A modern, concise JVM language — Google’s pick for Android.',
  },
  dart: {
    name: 'Dart', color: '#00B4AB', born: 2011,
    paradigm: 'Object-oriented', designer: 'Google (Lars Bak, Kasper Lund)', typing: 'Static',
    blurb: 'The language behind Flutter for cross-platform UIs.',
  },
  typescript: {
    name: 'TypeScript', color: '#3178C6', born: 2012,
    paradigm: 'Multi-paradigm (typed JS)', designer: 'Anders Hejlsberg (Microsoft)', typing: 'Static (gradual)',
    blurb: 'JavaScript with a type system — scales JS to large codebases.',
  },
  swift: {
    name: 'Swift', color: '#F05138', born: 2014,
    paradigm: 'Multi-paradigm', designer: 'Chris Lattner (Apple)', typing: 'Static, strong',
    blurb: 'Apple’s safe, fast successor to Objective-C.',
  },
}

export const FALLBACK_META = {
  name: 'Other', color: '#8892a0', born: 2000,
  paradigm: 'Mixed', designer: 'Various', typing: 'Varies',
  blurb: 'A language outside the curated set — grouped here as “Other”.',
}

// Extinct / legacy languages. They are (mostly) absent from the GitHub-trending
// dataset, so they carry no repositories — they are rendered as black holes in
// the universe view: collapsed galaxies whose light has gone out.
export const DEAD_LANGUAGES = {
  fortran:        { name: 'Fortran',        color: '#b06a2c', born: 1957, paradigm: 'Imperative, procedural', designer: 'John Backus (IBM)', typing: 'Static', blurb: 'Scientific computing’s ancestor — still humming inside legacy HPC, but rarely chosen anew.' },
  lisp:           { name: 'Lisp',           color: '#8e7cc3', born: 1958, paradigm: 'Functional', designer: 'John McCarthy', typing: 'Dynamic', blurb: 'The parenthesised elder. Its ideas live on across many tongues, the language itself a quiet relic.' },
  cobol:          { name: 'COBOL',          color: '#2e6b8f', born: 1959, paradigm: 'Procedural', designer: 'CODASYL (Grace Hopper)', typing: 'Static', blurb: 'Still runs the world’s banks — yet almost no one writes new COBOL.' },
  algol:          { name: 'ALGOL',          color: '#6b7a8f', born: 1958, paradigm: 'Structured', designer: 'Backus, Naur et al.', typing: 'Static', blurb: 'The grandfather of structured programming, now only history.' },
  pascal:         { name: 'Pascal',         color: '#3a7d44', born: 1970, paradigm: 'Structured', designer: 'Niklaus Wirth', typing: 'Static', blurb: 'Taught a generation to code; long since faded from production.' },
  smalltalk:      { name: 'Smalltalk',      color: '#c2913a', born: 1972, paradigm: 'Pure object-oriented', designer: 'Alan Kay et al. (Xerox PARC)', typing: 'Dynamic', blurb: 'Pure objects and a bold vision of computing — collapsed into legend.' },
  ada:            { name: 'Ada',            color: '#4f7a4f', born: 1980, paradigm: 'Structured, concurrent', designer: 'Jean Ichbiah (US DoD)', typing: 'Static, strong', blurb: 'Built for safety-critical systems; rarely seen beyond avionics and defence.' },
  'objective-c':  { name: 'Objective-C',    color: '#7a6fb0', born: 1984, paradigm: 'Object-oriented', designer: 'Brad Cox & Tom Love', typing: 'Static + dynamic', blurb: 'Powered the iPhone era until Swift eclipsed it.' },
  perl:           { name: 'Perl',           color: '#9b6a9b', born: 1987, paradigm: 'Multi-paradigm', designer: 'Larry Wall', typing: 'Dynamic', blurb: 'The web’s former duct tape — slowly winding down.' },
  'visual basic': { name: 'Visual Basic',   color: '#5a6fb0', born: 1991, paradigm: 'Event-driven', designer: 'Microsoft', typing: 'Static', blurb: 'Once everywhere on Windows desktops, now legacy-only.' },
  actionscript:   { name: 'ActionScript',   color: '#a8442c', born: 1998, paradigm: 'Object-oriented', designer: 'Macromedia / Adobe', typing: 'Dynamic + static', blurb: 'Died with Adobe Flash.' },
}

export function deadMeta(id) {
  return DEAD_LANGUAGES[languageKey(id)] ?? null
}

// Galaxy records for the dead languages (no systems — they are black holes).
export function deadGalaxies() {
  return Object.entries(DEAD_LANGUAGES).map(([id, m]) => ({
    id,
    name: m.name,
    color: m.color,
    born: m.born,
    dead: true,
    systemCount: 0,
    systems: [],
  }))
}

// Normalise GitHub's `language` string (e.g. "C++", "C#") into a metadata key.
export function languageKey(language) {
  return (language ?? '').trim().toLowerCase()
}

export function metaForLanguage(language) {
  return LANGUAGE_META[languageKey(language)] ?? FALLBACK_META
}

// Oldest / newest born years across the known set — used to normalise radius.
const BORN_YEARS = Object.values(LANGUAGE_META).map((m) => m.born)
export const OLDEST_BORN = Math.min(...BORN_YEARS)
export const NEWEST_BORN = Math.max(...BORN_YEARS)

// Inner / outer radius of the galaxy ring in the universe view.
export const UNIVERSE_INNER_RADIUS = 14
export const UNIVERSE_OUTER_RADIUS = 60

// Map a birth year → distance from the universe centre.
// Older language (smaller year) → larger radius (further out).
export function bornToRadius(born) {
  const span = NEWEST_BORN - OLDEST_BORN || 1
  const t = (NEWEST_BORN - born) / span // 0 = newest, 1 = oldest
  const clamped = Math.max(0, Math.min(1, t))
  return UNIVERSE_INNER_RADIUS + clamped * (UNIVERSE_OUTER_RADIUS - UNIVERSE_INNER_RADIUS)
}

// Deterministic hash → angle, so galaxy placement is stable between reloads.
export function hashAngle(id) {
  let hash = 0
  for (const ch of String(id)) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff
  return (Math.abs(hash) % 360) * (Math.PI / 180)
}

// Expanding-universe model: how far a galaxy has expanded out of the central
// singularity at a given timeline year. 1 = today (full extent), 0 = collapsed
// into the centre at the language's birth year. Below the birth year it is < 0
// (not yet born) — callers should hide it.
export function expansionFactor(born, year, today) {
  const denom = Math.max(today - born, 1)
  const f = (year - born) / denom
  return Math.max(0, Math.min(1, f))
}

// Stable world position of a galaxy in the universe view.
// Radius encodes language age; angle + vertical jitter are hashed from the id.
// Shared by Universe (rendering) and Scene (camera flight) so they always agree.
export function galaxyPosition(galaxy) {
  const radius = bornToRadius(galaxy.born)
  const angle = hashAngle(galaxy.id)
  const y = (hashAngle(galaxy.id + 'y') / Math.PI - 1) * 8 // -8..8
  return [Math.cos(angle) * radius, y, Math.sin(angle) * radius]
}
