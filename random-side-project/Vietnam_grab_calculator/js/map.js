/*
 * Leaflet map used inside the trip editor: shows pickup / drop-off pins and the route,
 * and lets you tap the map to place a pin.
 */
(function (root) {
  let map, fromMarker, toMarker, routeLine, onPick;

  const pin = (label, cls) =>
    L.divIcon({ className: "", html: `<div class="pin ${cls}">${label}</div>`, iconSize: [28, 28], iconAnchor: [14, 28] });

  function init(el, pickHandler) {
    onPick = pickHandler;
    map = L.map(el, { zoomControl: true, attributionControl: true }).setView(Geo.HCMC_CENTER, 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    map.on("click", (e) => onPick && onPick(e.latlng.lat, e.latlng.lng));
  }

  /** Redraw pins + route for a trip. */
  function show(trip, line) {
    if (!map) return;
    setTimeout(() => map.invalidateSize(), 50); // the editor slides in, so size changes
    [fromMarker, toMarker, routeLine].forEach((l) => l && map.removeLayer(l));
    fromMarker = toMarker = routeLine = null;

    const pts = [];
    if (trip.from) { fromMarker = L.marker([trip.from.lat, trip.from.lng], { icon: pin("A", "pin-a") }).addTo(map); pts.push([trip.from.lat, trip.from.lng]); }
    if (trip.to)   { toMarker = L.marker([trip.to.lat, trip.to.lng], { icon: pin("B", "pin-b") }).addTo(map); pts.push([trip.to.lat, trip.to.lng]); }
    if (line && line.length > 1) {
      routeLine = L.polyline(line, { color: "#00b14f", weight: 5, opacity: 0.85, dashArray: trip.routeSource === "estimate" ? "8 8" : null }).addTo(map);
    }

    setTimeout(() => {
      if (routeLine) map.fitBounds(routeLine.getBounds(), { padding: [30, 30] });
      else if (pts.length === 1) map.setView(pts[0], 15);
      else if (!pts.length) map.setView(Geo.HCMC_CENTER, 13);
    }, 80);
  }

  root.TripMap = { init, show };
})(window);
