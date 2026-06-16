// Universe-view timeline scrubber. Dragging the slider sets the "current" year;
// galaxies whose language predates the year stay lit, newer ones dim out — so
// scrubbing left replays the history of programming languages.

export default function Timeline({ min, max, year, onChange }) {
  const ticks = []
  for (let y = Math.ceil(min / 10) * 10; y <= max; y += 10) ticks.push(y)

  return (
    <div className="absolute bottom-6 left-6 w-[360px] font-mono text-white select-none">
      <div className="flex justify-between text-[10px] opacity-50 mb-1">
        <span>{min}</span>
        <span className="opacity-80 text-xs">◄ language timeline · {year} ►</span>
        <span>{max}</span>
      </div>

      <input
        type="range"
        min={min}
        max={max}
        value={year}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-amber-300 cursor-pointer"
      />

      <div className="relative h-3 mt-0.5">
        {ticks.map((t) => (
          <span
            key={t}
            className="absolute text-[9px] opacity-30 -translate-x-1/2"
            style={{ left: `${((t - min) / (max - min)) * 100}%` }}
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  )
}
