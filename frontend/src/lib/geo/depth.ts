/**
 * Point water depth from NOAA NGDC's global DEM mosaic (keyless ArcGIS
 * ImageServer). Returns depth in metres below sea level, or null on failure /
 * over land. Results are cached per rounded coordinate for the session.
 */
const depthCache = new Map<string, number | null>();

export async function lookupDepth(lon: number, lat: number): Promise<number | null> {
  const key = `${lon.toFixed(3)},${lat.toFixed(3)}`;
  const hit = depthCache.get(key);
  if (hit !== undefined) return hit;

  try {
    const url =
      "https://gis.ngdc.noaa.gov/arcgis/rest/services/DEM_mosaics/DEM_all/ImageServer/identify"
      + `?geometry=${encodeURIComponent(JSON.stringify({ x: lon, y: lat }))}`
      + "&geometryType=esriGeometryPoint&sr=4326&returnGeometry=false&returnCatalogItems=false&f=json";
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    const json = (await res.json()) as { value?: string };
    const elevation = Number.parseFloat(json.value ?? "");
    const depth = Number.isFinite(elevation) ? Math.max(0, -elevation) : null;
    depthCache.set(key, depth);
    return depth;
  } catch {
    depthCache.set(key, null);
    return null;
  }
}
