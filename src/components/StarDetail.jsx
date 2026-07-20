const ACCENT = '#7CFC9B'
const PANEL_BG = 'linear-gradient(160deg, rgba(10,18,13,0.92), rgba(5,9,7,0.94))'
const UNKNOWN = '???'

// L-shaped corner bracket (same as the board computer)
function Corner({ style }) {
  return (
    <div style={{
      position: 'absolute', width: 12, height: 12, borderColor: ACCENT,
      borderStyle: 'solid', opacity: 0.7, pointerEvents: 'none', ...style,
    }} />
  )
}

// Scan overlay that lays the ship-console HUD over the zoomed-in 3D star.
// Styled to match BoardComputer: green frame, scanlines, corner brackets, mono.
export default function StarDetail({ system, galaxy, onClose }) {
  const galaxyName = galaxy?.name ?? system.language ?? 'an uncharted'

  const description = `Long-range sensors register a star within the ${galaxyName} galaxy. `
    + `At this range its spectral signature is faint — stellar mass, luminosity, core activity `
    + `and orbiting bodies remain unresolved.`

  const stats = [
    ['designation', system.fullName],
    ['galaxy', galaxyName],
    ['stellar mass (stars)', UNKNOWN],
    ['orbiting worlds (forks)', UNKNOWN],
    ['core activity', UNKNOWN],
    ['classification', UNKNOWN],
    ['stellar age', UNKNOWN],
  ]

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 40, pointerEvents: 'none',
      background: 'linear-gradient(90deg, transparent 42%, rgba(3,8,6,0.55) 100%)',
      animation: 'sd-in 0.5s ease',
      fontFamily: 'monospace', color: '#dbe9d5',
    }}>
      <style>{`@keyframes sd-in { from { opacity: 0 } to { opacity: 1 } }`}</style>

      {/* header bar with the star name */}
      <div style={{
        position: 'absolute', top: '9%', left: '10%', pointerEvents: 'auto',
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 22px',
        background: PANEL_BG,
        border: `1px solid ${ACCENT}55`,
        borderRadius: 10,
        boxShadow: `0 0 18px ${ACCENT}22`,
      }}>
        <span className="animate-pulse" style={{ width: 8, height: 8, borderRadius: '50%', background: ACCENT, boxShadow: `0 0 6px ${ACCENT}` }} />
        <span style={{ letterSpacing: 2, fontSize: 16, fontWeight: 700, color: ACCENT, textShadow: `0 0 10px ${ACCENT}55` }}>
          {system.name}
        </span>
      </div>

      {/* telemetry panel */}
      <div style={{
        position: 'absolute', right: '5%', top: '10%', width: '40%', maxHeight: '78%',
        overflow: 'hidden', pointerEvents: 'auto',
        background: PANEL_BG,
        border: `1px solid ${ACCENT}55`,
        borderRadius: 12,
        boxShadow: `0 0 26px ${ACCENT}22, inset 0 0 44px ${ACCENT}0d`,
      }}>
        {/* scanlines */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: 12,
          background: `repeating-linear-gradient(0deg, ${ACCENT}0e 0px, ${ACCENT}0e 1px, transparent 1px, transparent 3px)`,
        }} />
        <Corner style={{ top: 6, left: 6, borderWidth: '1.5px 0 0 1.5px' }} />
        <Corner style={{ top: 6, right: 6, borderWidth: '1.5px 1.5px 0 0' }} />
        <Corner style={{ bottom: 6, left: 6, borderWidth: '0 0 1.5px 1.5px' }} />
        <Corner style={{ bottom: 6, right: 6, borderWidth: '0 1.5px 1.5px 0' }} />

        {/* content (scrolls) */}
        <div style={{ position: 'relative', zIndex: 1, maxHeight: '78vh', overflow: 'auto', padding: '24px 28px' }}>
          <div style={{ fontSize: 11, letterSpacing: 3, color: ACCENT, opacity: 0.75, marginBottom: 14 }}>
            ✦ STELLAR SURVEY · SCAN INCOMPLETE
          </div>

          <p style={{ fontSize: 13, lineHeight: 1.6, opacity: 0.82, marginBottom: 18 }}>{description}</p>

          <div style={{ border: `1px solid ${ACCENT}66`, background: `${ACCENT}12`, padding: '12px 14px', marginBottom: 20, borderRadius: 6 }}>
            <div style={{ color: ACCENT, fontWeight: 700, fontSize: 12.5, marginBottom: 4 }}>
              ⚠ DETAILS REQUIRE CLOSER PROXIMITY
            </div>
            <div style={{ fontSize: 11.5, opacity: 0.72, lineHeight: 1.5 }}>
              Board the ship and approach this system — the board computer completes the
              proximity scan and resolves the telemetry below.
            </div>
          </div>

          <div style={{ borderTop: `1px solid ${ACCENT}22`, paddingTop: 14, display: 'grid', gridTemplateColumns: 'auto 1fr', rowGap: 8, columnGap: 20, fontSize: 12.5 }}>
            {stats.map(([k, v]) => (
              <div key={k} style={{ display: 'contents' }}>
                <span style={{ opacity: 0.45 }}>{k}</span>
                <span style={{
                  textAlign: 'right',
                  color: v === UNKNOWN ? ACCENT : '#eef6ea',
                  opacity: v === UNKNOWN ? 0.6 : 1,
                  letterSpacing: v === UNKNOWN ? 2 : 0,
                }}>
                  {v}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* zoom out */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute', right: '5%', bottom: '6%', pointerEvents: 'auto',
          padding: '10px 26px',
          background: `${ACCENT}12`, color: ACCENT,
          fontFamily: 'monospace', fontWeight: 700, letterSpacing: 1, fontSize: 13,
          border: `1px solid ${ACCENT}`, borderRadius: 10,
          boxShadow: `0 0 16px ${ACCENT}22`, cursor: 'pointer',
        }}
      >
        ◂ Zoom Out
      </button>
    </div>
  )
}
