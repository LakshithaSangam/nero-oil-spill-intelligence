/**
 * Persistent build credit. A faint fixed corner mark shown on every screen
 * (sits under modals and the boot splash at z-[60]). A subtle translucent
 * backing keeps "by nanobots" legible over the map, the panels, the light
 * theme and the satellite landing alike. Never interactive.
 */
export function Watermark() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed bottom-1.5 right-2 z-[60] select-none rounded-[3px] bg-[rgb(var(--navy-950)/0.42)] px-1.5 py-[3px] text-[9.5px] font-medium uppercase leading-none tracking-[0.28em] text-[rgb(var(--sand-100)/0.55)] backdrop-blur-[2px]"
    >
      by nanobots
    </div>
  );
}
