import { Canvas } from '@react-three/fiber'
import { Stars, OrbitControls, KeyboardControls } from '@react-three/drei'
import { useState } from 'react'
import Sun from './Sun'
import Planet from './Planet'
import SpaceShip from './models/Optimized'
import ShipCamera from './ShipCamera'
import { useGithubDataset, ENCODING_LEGEND } from '../data/useGithubDataset'

const CONTROLS = [
  { name: 'forward',    keys: ['ArrowUp',    'KeyW'] },
  { name: 'backward',   keys: ['ArrowDown',  'KeyS'] },
  { name: 'left',       keys: ['ArrowLeft',  'KeyA'] },
  { name: 'right',      keys: ['ArrowRight', 'KeyD'] },
  { name: 'pitchUp',   keys: ['KeyQ'] },
  { name: 'pitchDown', keys: ['KeyE'] },
]

function formatNumber(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export default function Scene() {
  const [selected,   setSelected]   = useState(null)
  const [showLegend, setShowLegend] = useState(false)
  const [mode,       setMode]       = useState('overview') // 'overview' | 'fly'
  const [speed,      setSpeed]      = useState(0)

  const { planets, month, loading, error } = useGithubDataset({ topN: 20 })

  function toggleMode() {
    setMode(m => m === 'fly' ? 'overview' : 'fly')
    setSelected(null)
  }

  return (
    <KeyboardControls map={CONTROLS}>
      <div className="relative w-screen h-screen bg-black">
        <Canvas
          camera={{ position: [0, 10, 22], fov: 55, near: 0.1, far: 500 }}
          gl={{ antialias: true }}
        >
          <ambientLight intensity={0.35} />
          <Stars radius={120} depth={60} count={6000} factor={4} saturation={0} fade speed={0.6} />

          <Sun />

          {planets.map((p) => (
            <Planet
              key={p.id}
              {...p}
              onSelect={mode === 'overview' ? setSelected : undefined}
            />
          ))}

          {mode === 'fly' ? (
            <ShipCamera onSpeedChange={setSpeed} />
          ) : (
            <>
              <SpaceShip
                scale={0.28}
                position={[7, 1.5, 10]}
                rotation={[0.05, -Math.PI * 0.35, 0.04]}
              />
              <OrbitControls
                enablePan
                enableZoom
                enableRotate
                minDistance={3}
                maxDistance={80}
                target={[0, 0, 0]}
              />
            </>
          )}
        </Canvas>

        {/* ── HUD top-left ── */}
        <div className="absolute top-4 left-4 font-mono text-white pointer-events-none">
          <div className="text-base font-bold opacity-90">HABITABLE WORLDS</div>
          {month && (
            <div className="text-xs opacity-50 mt-0.5">GitHub trending · {month}</div>
          )}
          {mode === 'overview' && (
            <div className="text-xs opacity-40 mt-1">drag · scroll to navigate</div>
          )}
          {mode === 'fly' && (
            <div className="text-xs opacity-60 mt-1 space-y-0.5">
              <div>WASD / ↑↓←→ · Q/E pitch</div>
              <div className="opacity-80">
                {speed < 0.1
                  ? 'SPEED  —'
                  : `SPEED  ${speed.toFixed(1)} u/s`}
              </div>
            </div>
          )}
        </div>

        {/* ── Board / Exit Ship button ── */}
        <button
          className="absolute top-4 left-1/2 -translate-x-1/2 font-mono text-xs border rounded-lg px-4 py-2 transition-colors"
          style={{
            color:            mode === 'fly' ? '#f87171' : '#86efac',
            borderColor:      mode === 'fly' ? '#f87171' : '#86efac',
            background:       'rgba(0,0,0,0.6)',
            backdropFilter:   'blur(4px)',
          }}
          onClick={toggleMode}
        >
          {mode === 'fly' ? '✕  Exit Ship' : '▶  Board Ship'}
        </button>

        {/* ── Legend toggle (hidden in fly mode) ── */}
        {mode === 'overview' && (
          <button
            className="absolute top-4 right-4 font-mono text-xs text-white/50 hover:text-white/90 border border-white/20 hover:border-white/50 rounded-lg px-3 py-1.5 transition-colors"
            onClick={() => setShowLegend(v => !v)}
          >
            {showLegend ? 'hide legend' : 'legend'}
          </button>
        )}

        {/* ── Legend panel ── */}
        {showLegend && mode === 'overview' && (
          <div className="absolute top-14 right-4 bg-black/70 border border-white/20 rounded-xl px-4 py-3 font-mono text-xs text-white backdrop-blur-sm w-64">
            <div className="font-bold mb-2 opacity-80">Visual Encoding</div>
            {ENCODING_LEGEND.map(({ visual, data }) => (
              <div key={visual} className="grid grid-cols-2 gap-2 mb-1">
                <span className="opacity-50">{visual}</span>
                <span className="opacity-80">{data}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Loading ── */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="font-mono text-white/60 text-sm animate-pulse">
              scanning repositories…
            </div>
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-red-900/70 border border-red-400/40 rounded-xl px-5 py-3 font-mono text-xs text-red-200 backdrop-blur-sm">
            Failed to load dataset: {error}
          </div>
        )}

        {/* ── Planet info panel (overview only) ── */}
        {selected && !loading && mode === 'overview' && (
          <div
            className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/75 border border-white/20 rounded-xl px-6 py-4 font-mono text-sm text-white backdrop-blur-sm cursor-pointer select-none"
            onClick={() => setSelected(null)}
          >
            <div className="flex items-center gap-3 mb-3">
              <span
                className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                style={{ background: selected.color }}
              />
              <span className="font-bold text-base">{selected.fullName ?? selected.name}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs opacity-80">
              <span className="opacity-50">rank</span>
              <span>#{selected.rank}</span>
              <span className="opacity-50">stars</span>
              <span>⭐ {formatNumber(selected.stars)}</span>
              <span className="opacity-50">forks</span>
              <span>🍴 {formatNumber(selected.forks)}</span>
              <span className="opacity-50">months in top</span>
              <span>{selected.appearances}×</span>
            </div>
            <div className="mt-3 opacity-30 text-xs">click to dismiss</div>
          </div>
        )}
      </div>
    </KeyboardControls>
  )
}
