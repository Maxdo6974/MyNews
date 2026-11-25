/** Onde audio décorative : s'anime pendant la lecture, indique la progression. */
const HEIGHTS = [0.35, 0.6, 0.9, 0.55, 0.75, 1, 0.65, 0.4, 0.8, 0.95, 0.5, 0.7, 0.45, 0.85, 0.6, 1, 0.55, 0.35, 0.75, 0.9, 0.5, 0.65, 0.4, 0.8, 0.6, 0.95, 0.45, 0.7, 0.55, 0.3];

export default function Waveform({ playing, progress = 0, className = "" }: { playing: boolean; progress?: number; className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-[3px] h-12 ${playing ? "wave-on" : ""} ${className}`} aria-hidden>
      {HEIGHTS.map((h, i) => (
        <span
          key={i}
          className={`wave-bar w-[3px] rounded-full ${i / HEIGHTS.length < progress ? "bg-accent" : "bg-line"}`}
          style={{ height: `${h * 100}%`, animationDelay: `${(i % 7) * 0.12}s` }}
        />
      ))}
    </div>
  );
}
