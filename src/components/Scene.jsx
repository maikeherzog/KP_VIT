import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { Stars, OrbitControls, KeyboardControls } from '@react-three/drei'
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import Universe from './Universe'
import GalaxyView from './GalaxyView'
import ShipController from './ShipCamera'
import SearchBar from './SearchBar'
import Timeline from './Timeline'
import BoardComputer from './BoardComputer'
import ProximityDetector from './ProximityDetector'
import StarDetail from './StarDetail'
import { layoutSystems } from '../data/galaxyLayout'
import { useUniverse } from '../data/useUniverse'
import { galaxyPosition } from '../data/languages'

const CONTROLS = [
  { name: 'forward',   keys: ['ArrowUp',    'KeyW'] },
  { name: 'backward',  keys: ['ArrowDown',  'KeyS'] },
  { name: 'left',      keys: ['ArrowLeft',  'KeyA'] },
  { name: 'right',     keys: ['ArrowRight', 'KeyD'] },
  { name: 'pitchUp',   keys: ['KeyQ'] },
  { name: 'pitchDown', keys: ['KeyE'] },
]

const ORIGIN           = new THREE.Vector3(0, 0, 0)
const UNIVERSE_DEFAULT = new THREE.Vector3(0, 70, 175)
const GALAXY_DEFAULT   = new THREE.Vector3(0, 48, 115)
const SHIP_START       = new THREE.Vector3(0, 2, 18)   // matches ShipController spawn
const SHIP_CHASE       = new THREE.Vector3(0, 1, 3) // behind (+Z) and above the ship
const CURRENT_YEAR     = new Date().getFullYear()

// star radius from star_count (mirrors StarSystem) — used to frame the zoom
function starRadius(stars) {
  return 0.4 + Math.min(1, Math.log10(Math.max(stars, 1)) / 5.4) * 2.6
}

// Drives the camera during view transitions; exposes an imperative snap().
const CameraController = forwardRef(function CameraController({ transition }, ref) {
  const { camera } = useThree()
  useImperativeHandle(ref, () => ({
    snap(pos, look) { camera.position.copy(pos); camera.lookAt(look) },
  }), [camera])
  useFrame(() => {
    if (!transition) return
    camera.position.lerp(transition.target, 0.07)
    camera.lookAt(transition.look)
  })
  return null
})

export default function Scene({ searchOpen, onSearchOpenChange }) {
  const { galaxies, loading, usingFallback } = useUniverse()

  const [view,       setView]       = useState('universe') // 'universe' | 'galaxy'
  const [activeId,   setActiveId]   = useState(null)
  const [selected,   setSelected]   = useState(null)
  const [flyMode,    setFlyMode]    = useState(false)
  const [showLegend, setShowLegend] = useState(false)
  const [transition, setTransition] = useState(null)       // { phase, target, look }
  const [fade,       setFade]       = useState(0)
  const [year,       setYear]       = useState(CURRENT_YEAR)

  const cameraRef = useRef(null)
  const controlsRef = useRef(null)
  const shipPosRef = useRef(new THREE.Vector3())
  const timers = useRef([])

  const [nearby, setNearby] = useState(null)

  const activeGalaxy = useMemo(
    () => galaxies.find((g) => g.id === activeId) ?? null,
    [galaxies, activeId],
  )

  // Candidate objects the board computer can detect: star systems in galaxy
  // view, galaxies in universe view (with their world positions).
  const proximityTargets = useMemo(() => {
    if (view === 'galaxy' && activeGalaxy) {
      return layoutSystems(activeGalaxy.systems ?? []).map(({ system, position }) => ({
        kind: 'system', id: system.id, position, data: system,
      }))
    }
    return galaxies
      .filter((g) => year == null || year > g.born)
      .map((g) => ({ kind: 'galaxy', id: g.id, position: new THREE.Vector3(...galaxyPosition(g)), data: g }))
  }, [view, activeGalaxy, galaxies, year])

  const minYear = useMemo(
    () => (galaxies.length ? Math.min(...galaxies.map((g) => g.born)) : 1970),
    [galaxies],
  )

  // clear pending timeouts on unmount
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  function later(fn, ms) { timers.current.push(setTimeout(fn, ms)) }

  // On boarding the ship, snap to a chase position behind it; on leaving, return
  // to the current view's overview. (Deliberately only depends on flyMode so it
  // never fires during the universe↔galaxy cinematic transitions.)
  useEffect(() => {
    const c = controlsRef.current
    if (flyMode) {
      cameraRef.current?.snap(SHIP_CHASE, SHIP_START)
      if (c) { c.target.copy(SHIP_START); c.update() }
    } else {
      const def = view === 'galaxy' ? GALAXY_DEFAULT : UNIVERSE_DEFAULT
      cameraRef.current?.snap(def, ORIGIN)
      if (c) { c.target.copy(ORIGIN); c.update() }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyMode])

  function enterGalaxy(id, selectAfter = null) {
    const galaxy = galaxies.find((g) => g.id === id)
    if (!galaxy) return
    if (view === 'galaxy' && activeId === id) { if (selectAfter) setSelected(selectAfter); return }

    setFlyMode(false)
    setSelected(null)
    // alive galaxies rest at their full position, so fly straight to it
    const gpos = new THREE.Vector3(...galaxyPosition(galaxy))
    setTransition({ phase: 'enter', target: gpos.clone().multiplyScalar(0.7), look: gpos })

    later(() => setFade(1), 650)
    later(() => {
      setActiveId(id)
      setView('galaxy')
      setTransition(null)
      cameraRef.current?.snap(GALAXY_DEFAULT, ORIGIN)
      if (selectAfter) setSelected(selectAfter)
    }, 850)
    later(() => setFade(0), 1050)
  }

  function backToUniverse() {
    const galaxy = activeGalaxy
    setSelected(null)
    setFade(1)
    later(() => {
      setView('universe')
      setActiveId(null)
      const from = galaxy
        ? new THREE.Vector3(...galaxyPosition(galaxy)).multiplyScalar(0.7)
        : UNIVERSE_DEFAULT.clone()
      cameraRef.current?.snap(from, ORIGIN)
      setTransition({ phase: 'back', target: UNIVERSE_DEFAULT.clone(), look: ORIGIN })
    }, 220)
    later(() => setFade(0), 420)
    later(() => setTransition(null), 1500)
  }

  function toggleFly() {
    setFlyMode((v) => !v)
    setSelected(null)
    setNearby(null)
    setTransition(null)
  }

  // Click a star → cinematically zoom the camera onto it so its curved surface
  // fills the frame; the StarDetail HUD lays over it. Camera stays parked (the
  // transition is left set) until "Zoom Out".
  function zoomToStar(system) {
    if (flyMode || !activeGalaxy) { setSelected(system); return }
    const placed = layoutSystems(activeGalaxy.systems ?? []).find((p) => p.system.id === system.id)
    if (!placed) { setSelected(system); return }

    const pos = placed.position.clone()
    const r = starRadius(system.stars)
    const dir = new THREE.Vector3(0.4, 0.55, 1).normalize()
    const camPos = pos.clone().add(dir.multiplyScalar(r * 2.0))
    // aim above + right of centre so the star sinks to the lower-left, HUD to the right
    const viewDir = pos.clone().sub(camPos).normalize()
    const right = new THREE.Vector3().crossVectors(viewDir, ORIGIN.clone().setY(1)).normalize()
    const look = pos.clone().add(right.multiplyScalar(r * 0.9)).add(new THREE.Vector3(0, r * 0.6, 0))

    setSelected(system)
    setTransition({ phase: 'star', target: camPos, look })
  }

  function closeStar() {
    setSelected(null)
    setTransition({ phase: 'back', target: GALAXY_DEFAULT.clone(), look: ORIGIN })
    later(() => setTransition(null), 1200)
  }

  return (
    <KeyboardControls map={CONTROLS}>
      <div className="relative w-screen h-screen bg-black overflow-hidden">
        <Canvas
          camera={{ position: [0, 70, 175], fov: 55, near: 0.1, far: 1000 }}
          gl={{ antialias: true }}
        >
          <Stars radius={300} depth={120} count={9000} factor={5} saturation={0} fade speed={0.4} />

          <CameraController ref={cameraRef} transition={flyMode ? null : transition} />

          {view === 'universe'
            ? <Universe galaxies={galaxies} onSelectGalaxy={enterGalaxy} year={year} />
            : activeGalaxy && <GalaxyView galaxy={activeGalaxy} onSelectSystem={zoomToStar} />
          }

          {!transition && (
            <OrbitControls
              ref={controlsRef}
              key={view + (flyMode ? '-fly' : '')}
              makeDefault
              enablePan={!flyMode}
              enableZoom
              enableRotate
              minDistance={flyMode ? 2 : 5}
              maxDistance={flyMode ? 80 : view === 'universe' ? 450 : 650}
              target={flyMode ? undefined : [0, 0, 0]}
            />
          )}
          {flyMode && <ShipController controlsRef={controlsRef} shipPosRef={shipPosRef} />}
          {flyMode && (
            <ProximityDetector
              shipPosRef={shipPosRef}
              targets={proximityTargets}
              onNearby={setNearby}
            />
          )}
        </Canvas>

        {/* ── Breadcrumb / title ── */}
        <div className="absolute top-4 left-4 font-mono text-white pointer-events-none">
          <div className="text-base font-bold opacity-90">HABITABLE WORLDS</div>
          <div className="text-xs opacity-50 mt-0.5">
            UNIVERSE
            {activeGalaxy && <span className="opacity-90"> / {activeGalaxy.name}</span>}
          </div>
          {flyMode && <div className="text-xs opacity-60 mt-1">WASD / ↑↓←→ · Q/E pitch · drag to look</div>}
          {!flyMode && view === 'universe' && (
            <div className="text-xs opacity-40 mt-1">click a galaxy to enter</div>
          )}
        </div>

        {/* ── Top-centre controls ── */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-2">
          {view === 'galaxy' && !flyMode && (
            <button
              className="font-mono text-xs text-white/80 border border-white/30 hover:border-white/70 rounded-lg px-4 py-2 bg-black/60 backdrop-blur-sm transition-colors"
              onClick={backToUniverse}
            >
              ← Universe
            </button>
          )}
          {/* Boarding the ship is only possible inside a galaxy */}
          {view === 'galaxy' && (
            <button
              className="font-mono text-xs border rounded-lg px-4 py-2 bg-black/60 backdrop-blur-sm transition-colors"
              style={{
                color:       flyMode ? '#f87171' : '#86efac',
                borderColor: flyMode ? '#f87171' : '#86efac',
              }}
              onClick={toggleFly}
            >
              {flyMode ? '✕ Exit Ship' : '▶ Board Ship'}
            </button>
          )}
        </div>

        {/* ── Legend toggle ── */}
        {!flyMode && (
          <button
            className="absolute top-4 right-4 font-mono text-xs text-white/50 hover:text-white/90 border border-white/20 hover:border-white/50 rounded-lg px-3 py-1.5 transition-colors"
            onClick={() => setShowLegend((v) => !v)}
          >
            {showLegend ? 'hide legend' : 'legend'}
          </button>
        )}

        {/* ── Legend panel ── */}
        {showLegend && !flyMode && (
          <div className="absolute top-14 right-4 bg-black/70 border border-white/20 rounded-xl px-4 py-3 font-mono text-xs text-white backdrop-blur-sm w-72">
            <div className="font-bold mb-2 opacity-80">
              {view === 'universe' ? 'Universe — Visual Encoding' : 'Galaxy — Visual Encoding'}
            </div>
            {(view === 'universe'
              ? [
                  ['Galaxy', 'Programming language'],
                  ['Distance from centre', 'Language age (older = further)'],
                  ['Galaxy size', 'Number of repositories'],
                  ['Colour', 'Language identity'],
                ]
              : [
                  ['Star', 'Repository'],
                  ['Star size', 'Star count (log)'],
                  ['Brightness', 'Recent activity'],
                  ['Warm colour', 'Habitable (actively maintained)'],
                  ['Planet', 'Notable fork'],
                ]
            ).map(([k, v]) => (
              <div key={k} className="grid grid-cols-2 gap-2 mb-1">
                <span className="opacity-50">{k}</span>
                <span className="opacity-80">{v}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Timeline (universe view only) ── */}
        {!flyMode && view === 'universe' && !loading && (
          <Timeline min={minYear} max={CURRENT_YEAR} year={year} onChange={setYear} />
        )}

        {/* ── Search ── */}
        {!flyMode && !loading && (
          <SearchBar
            galaxies={galaxies}
            isOpen={searchOpen}
            onOpenChange={onSearchOpenChange}
            onPickGalaxy={(id) => enterGalaxy(id)}
            onPickSystem={(gid, system) => enterGalaxy(gid, system)}
          />
        )}

        {/* ── Loading ── */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="font-mono text-white/60 text-sm animate-pulse">charting the universe…</div>
          </div>
        )}

        {/* ── Fallback notice ── */}
        {usingFallback && !loading && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 font-mono text-[10px] text-amber-300/60 pointer-events-none">
            sample data — run <span className="opacity-100">node scripts/enrich.mjs</span> for live data
          </div>
        )}

        {/* ── Star detail scan view (Mass-Effect style) ── */}
        {selected && !flyMode && view === 'galaxy' && (
          <StarDetail system={selected} galaxy={activeGalaxy} onClose={closeStar} />
        )}

        {/* ── Board computer (fly mode) ── */}
        {flyMode && <BoardComputer nearby={nearby} galaxy={activeGalaxy} />}

        {/* ── Transition fade ── */}
        <div
          className="absolute inset-0 bg-black pointer-events-none transition-opacity duration-300"
          style={{ opacity: fade }}
        />
      </div>
    </KeyboardControls>
  )
}
