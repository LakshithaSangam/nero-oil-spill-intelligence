/** Presentation helpers for coordinates and geospatial quantities. */

export function formatLat(lat: number): string {
  const h = lat >= 0 ? "N" : "S";
  return `${Math.abs(lat).toFixed(4)}° ${h}`;
}

export function formatLon(lon: number): string {
  const h = lon >= 0 ? "E" : "W";
  return `${Math.abs(lon).toFixed(4)}° ${h}`;
}

export function formatLatLon(lon: number, lat: number): string {
  return `${formatLat(lat)}  ${formatLon(lon)}`;
}

/** Ground resolution (metres per pixel) at a latitude/zoom for a 512px tile scheme. */
export function metresPerPixel(lat: number, zoom: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

/** A "nice" round distance for a scale bar, given a max pixel width. */
export function niceScale(
  lat: number,
  zoom: number,
  maxPx = 120,
): { metres: number; px: number; label: string } {
  const mpp = metresPerPixel(lat, zoom);
  const maxMetres = mpp * maxPx;
  const pow = 10 ** Math.floor(Math.log10(maxMetres));
  const candidates = [1, 2, 5, 10].map((m) => m * pow);
  const metres = [...candidates].reverse().find((c) => c <= maxMetres) ?? pow;
  const label = metres >= 1000 ? `${metres / 1000} km` : `${metres} m`;
  return { metres, px: metres / mpp, label };
}

export function formatArea(km2: number): string {
  if (km2 < 1) return `${(km2 * 100).toFixed(1)} ha`;
  return `${km2.toFixed(1)} km²`;
}
