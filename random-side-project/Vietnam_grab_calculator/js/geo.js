/*
 * Place search (OpenStreetMap Nominatim) and road routing (OSRM public demo server).
 * Both are free and need no API key. Nominatim asks for at most 1 request per second,
 * so every call goes through a small queue that spaces requests out.
 */
(function (root) {
  const NOMINATIM = "https://nominatim.openstreetmap.org";
  const OSRM = "https://router.project-osrm.org/route/v1/driving";

  // Bounding box around Ho Chi Minh City (incl. Thu Duc, Binh Chanh, Nha Be, Cu Chi edge)
  const HCMC_VIEWBOX = { west: 106.35, north: 11.17, east: 107.03, south: 10.35 };
  const HCMC_CENTER = [10.7769, 106.7009];

  let lastCall = 0;
  let chain = Promise.resolve();
  function throttled(fn) {
    const run = chain.then(async () => {
      const wait = Math.max(0, lastCall + 1100 - Date.now());
      if (wait) await new Promise((r) => setTimeout(r, wait));
      lastCall = Date.now();
      return fn();
    });
    chain = run.catch(() => {});
    return run;
  }

  async function searchPlaces(query, signal) {
    const q = query.trim();
    if (q.length < 3) return [];
    const { west, north, east, south } = HCMC_VIEWBOX;
    const params = new URLSearchParams({
      q, format: "jsonv2", countrycodes: "vn", limit: "6", bounded: "1",
      viewbox: `${west},${north},${east},${south}`, "accept-language": "en,vi",
    });
    return throttled(async () => {
      if (signal?.aborted) return [];
      const res = await fetch(`${NOMINATIM}/search?${params}`, { signal });
      if (!res.ok) throw new Error(`Search failed (${res.status})`);
      const data = await res.json();
      return data.map((p) => ({
        name: shortName(p),
        full: p.display_name,
        lat: Number(p.lat),
        lng: Number(p.lon),
      }));
    });
  }

  async function reverseGeocode(lat, lng) {
    const params = new URLSearchParams({ lat, lon: lng, format: "jsonv2", zoom: "17", "accept-language": "en,vi" });
    try {
      return await throttled(async () => {
        const res = await fetch(`${NOMINATIM}/reverse?${params}`);
        if (!res.ok) throw new Error();
        const p = await res.json();
        return shortName(p) || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      });
    } catch {
      return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
  }

  function shortName(p) {
    if (!p) return "";
    const a = p.address || {};
    const first = p.name || a.amenity || a.tourism || a.shop || a.building ||
      [a.house_number, a.road].filter(Boolean).join(" ");
    const area = a.suburb || a.quarter || a.city_district || a.district || "";
    return [first, area].filter(Boolean).join(", ") || (p.display_name || "").split(",").slice(0, 2).join(",");
  }

  /** Road route between two points. Falls back to straight-line × 1.3 if OSRM fails. */
  async function route(from, to) {
    const url = `${OSRM}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`Routing failed (${res.status})`);
      const data = await res.json();
      const r = data.routes?.[0];
      if (!r) throw new Error("No route");
      return {
        km: r.distance / 1000,
        min: r.duration / 60,
        line: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
        source: "osrm",
      };
    } catch {
      const km = haversineKm(from, to) * 1.3;
      return { km, min: (km / 25) * 60, line: [[from.lat, from.lng], [to.lat, to.lng]], source: "estimate" };
    }
  }

  function haversineKm(a, b) {
    const R = 6371, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  root.Geo = { searchPlaces, reverseGeocode, route, haversineKm, HCMC_VIEWBOX, HCMC_CENTER };
})(window);
