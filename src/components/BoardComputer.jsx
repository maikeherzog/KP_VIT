import { useEffect, useMemo, useState } from 'react'
import { buildNarratorContext, requestNarration } from '../data/narratorContext'

const ACCENT = '#7CFC9B'
const PANEL_W = 360

// L-shaped corner bracket
function Corner({ style }) {
  return (
    <div style={{
      position: 'absolute', width: 12, height: 12, borderColor: ACCENT,
      borderStyle: 'solid', opacity: 0.7, pointerEvents: 'none', ...style,
    }} />
  )
}

// Expandable ship console: a sci-fi panel that slides in/out from the left and
// surfaces the nearest object + the exact context fed to the LLM narrator.
export default function BoardComputer({ nearby, galaxy }) {
  const [open, setOpen] = useState(true)
  const [showContext, setShowContext] = useState(false)
  const [log, setLog] = useState(null)
  const [loading, setLoading] = useState(false)
  const [speaking, setSpeaking] = useState(false)

  const ctx = useMemo(
    () => (nearby ? buildNarratorContext({ ...nearby, galaxy }) : null),
    [nearby, galaxy],
  )

  useEffect(() => {
    if (!nearby || nearby.kind !== 'system') {
      setLog(null)
      setLoading(false)
      speechSynthesis.cancel()
      setSpeaking(false)
      return
    }

    let cancelled = false
    setLog(null)
    setLoading(true)
    speechSynthesis.cancel()
    setSpeaking(false)

    const context = buildNarratorContext({ ...nearby, galaxy })

    requestNarration(context, galaxy).then((text) => {
      if (cancelled) return
      setLog(text)
      setLoading(false)

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.onend = () => { if (!cancelled) setSpeaking(false) }
      utterance.onerror = () => { if (!cancelled) setSpeaking(false) }
      setSpeaking(true)
      speechSynthesis.speak(utterance)
    })

    return () => {
      cancelled = true
      speechSynthesis.cancel()
      setSpeaking(false)
    }
  }, [nearby?.id, nearby?.kind, galaxy])

  function stopSpeech() {
    speechSynthesis.cancel()
    setSpeaking(false)
  }

  return (
    <div
      className="absolute top-1/2 left-0 flex items-center font-mono text-white select-none"
      style={{
        transform: `translate(${open ? 0 : -PANEL_W}px, -50%)`,
        transition: 'transform 0.45s cubic-bezier(0.22, 1, 0.36, 1)',
        zIndex: 20,
      }}
    >
      {/* ── console panel ── */}
      <div style={{
        position: 'relative',
        width: PANEL_W,
        maxHeight: '78vh',
        overflow: 'hidden',
        background: 'linear-gradient(160deg, rgba(10,18,13,0.94), rgba(5,9,7,0.95))',
        border: `1px solid ${ACCENT}55`,
        borderLeft: 'none',
        borderRadius: '0 8px 8px 0',
        boxShadow: `0 0 26px ${ACCENT}22, inset 0 0 44px ${ACCENT}0d`,
      }}>
        {/* scanline overlay */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: '0 8px 8px 0',
          background: `repeating-linear-gradient(0deg, ${ACCENT}0e 0px, ${ACCENT}0e 1px, transparent 1px, transparent 3px)`,
        }} />
        {/* corner brackets (right side) */}
        <Corner style={{ top: 6, right: 6, borderWidth: '1.5px 1.5px 0 0' }} />
        <Corner style={{ bottom: 6, right: 6, borderWidth: '0 1.5px 1.5px 0' }} />

        {/* content */}
        <div style={{ position: 'relative', zIndex: 1, maxHeight: '78vh', overflow: 'auto' }} className="px-4 py-3">
          {/* header */}
          <div className="flex items-center gap-2 pb-2 mb-2" style={{ borderBottom: `1px solid ${ACCENT}22` }}>
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: ACCENT, boxShadow: `0 0 6px ${ACCENT}` }} />
            <span className="text-xs tracking-[0.2em] font-bold" style={{ color: ACCENT }}>BOARD COMPUTER</span>
            <span className="ml-auto text-[10px] opacity-50">{nearby ? `◎ ${ctx?.distance}u` : '◎ scan'}</span>
          </div>

          {!ctx ? (
            <div className="text-xs opacity-50 py-4 text-center">
              <div className="mb-1" style={{ color: ACCENT, opacity: 0.6 }}>:: NO CONTACT ::</div>
              fly closer to a star system
            </div>
          ) : (
            <>
              {/* subject */}
              <div className="flex items-center gap-2 mb-2">
                <span style={{ color: ACCENT }}>{ctx.kind === 'system' ? '★' : '✦'}</span>
                <span className="text-sm font-bold truncate">{ctx.subject}</span>
                <span className="ml-auto text-[10px] opacity-50">{ctx.distance}u</span>
              </div>

              {/* facts */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] opacity-85 mb-3">
                {Object.entries(ctx.facts).map(([k, v]) => (
                  <div key={k} className="contents">
                    <span className="opacity-45">{k}</span>
                    <span className="truncate">{Array.isArray(v) ? v.join(', ') : String(v)}</span>
                  </div>
                ))}
              </div>

              {/* narrator context */}
              <button
                className="text-[10px] tracking-wide opacity-50 hover:opacity-90 transition-opacity mb-1"
                onClick={() => setShowContext((v) => !v)}
              >
                {showContext ? '▾' : '▸'} NARRATOR INPUT (LLM context)
              </button>
              {showContext && (
                <pre
                  className="text-[10px] leading-snug opacity-70 rounded-lg p-2 mb-3 max-h-40 overflow-auto whitespace-pre-wrap"
                  style={{ background: `${ACCENT}0a`, border: `1px solid ${ACCENT}22` }}
                >
                  {ctx.prompt}
                </pre>
              )}

              {ctx.kind === 'system' && loading && !log && (
                <div className="text-xs opacity-50 py-1 text-center">narrating…</div>
              )}

              {ctx.kind === 'system' && speaking && (
                <button
                  className="w-full text-xs rounded-lg px-3 py-2 mt-1 transition-colors"
                  style={{ border: `1px solid ${ACCENT}`, color: ACCENT, background: `${ACCENT}10` }}
                  onClick={stopSpeech}
                >
                  ⏹ Stop narration
                </button>
              )}

              {log && (
                <div className="mt-3 text-xs leading-relaxed opacity-90 border-l-2 pl-3" style={{ borderColor: ACCENT }}>
                  {log}
                  <div className="mt-1.5 text-[9px] opacity-40">ship log · llama3.2:1b</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── slide handle ── */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? 'retract computer' : 'deploy computer'}
        style={{
          width: 26, height: 92,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
          background: 'linear-gradient(160deg, rgba(10,18,13,0.95), rgba(5,9,7,0.96))',
          border: `1px solid ${ACCENT}55`,
          borderLeft: 'none',
          borderRadius: '0 10px 10px 0',
          color: ACCENT,
          boxShadow: `0 0 16px ${ACCENT}22`,
          cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: 13 }}>{open ? '◀' : '▶'}</span>
        <span style={{ writingMode: 'vertical-rl', fontSize: 8, letterSpacing: 2, opacity: 0.6 }}>COMPUTER</span>
      </button>
    </div>
  )
}
