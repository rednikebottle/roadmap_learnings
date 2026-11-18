/*
 * Fare tables and fare maths.
 *
 * Grab does not publish an official fare table. Defaults are the TP.HCM table from
 * Viettel Store (26 Dec 2025), cross-checked against Day Trips Vietnam (Sep 2026):
 *   https://viettelstore.vn/tin-tuc/grab-bao-nhieu-tien-1km
 *   https://daytripsvietnam.com/guides/vietnam-grab-prices-2026/
 * Everything here is editable in the app's Settings panel.
 */
(function (root) {
  const VEHICLES = {
    bike:     { label: "GrabBike",       icon: "🛵", seats: 1, base: 12500, perKm: 4300,  perMin: 350 },
    bikePlus: { label: "GrabBike Plus",  icon: "🏍️", seats: 1, base: 16000, perKm: 5300,  perMin: 370 },
    carSaver: { label: "GrabCar Saver",  icon: "🚗", seats: 4, base: 26700, perKm: 9100,  perMin: 370 },
    car4:     { label: "GrabCar 4-seat", icon: "🚕", seats: 4, base: 29000, perKm: 10000, perMin: 450 },
    carPlus:  { label: "GrabCar Plus",   icon: "🚘", seats: 4, base: 34200, perKm: 12600, perMin: 530 },
    car7:     { label: "GrabCar 7-seat", icon: "🚐", seats: 7, base: 34000, perKm: 13000, perMin: 550 },
  };

  const BASE_KM = 2;

  // Time-of-day presets drive the surge multiplier (user can still override).
  const SURGE_PRESETS = [
    { id: "normal",  label: "Normal",            surge: 1.0 },
    { id: "rush",    label: "Rush hour",         surge: 1.3 },
    { id: "rain",    label: "Rain",              surge: 1.5 },
    { id: "night",   label: "Late night",        surge: 1.2 },
    { id: "holiday", label: "Holiday / Tết",     surge: 2.0 },
  ];

  const TIMES_OF_DAY = [
    { id: "morning",  label: "Morning",            preset: "normal" },
    { id: "amRush",   label: "7–9am rush",         preset: "rush" },
    { id: "midday",   label: "Midday",             preset: "normal" },
    { id: "pmRush",   label: "5–7pm rush",         preset: "rush" },
    { id: "evening",  label: "Evening",            preset: "normal" },
    { id: "late",     label: "11pm–5am",           preset: "night" },
  ];

  function defaultSettings() {
    const rates = {};
    for (const [id, v] of Object.entries(VEHICLES)) {
      rates[id] = { base: v.base, perKm: v.perKm, perMin: v.perMin };
    }
    return {
      rates,
      airportFee: 20000,     // Tan Son Nhat pickup, ~10–25k₫
      trafficFactor: 1.5,    // OSRM drive times assume free-flowing roads; HCMC traffic is slower
      currency: "VND",
      fx: { USD: 26025, SGD: 20130 }, // ₫ per 1 unit
    };
  }

  const roundTo1000 = (n) => Math.round(n / 1000) * 1000;

  /** How many vehicles are needed to carry `people` in vehicle `vehicleId`. */
  function vehiclesNeeded(vehicleId, people) {
    const seats = VEHICLES[vehicleId]?.seats ?? 1;
    return Math.max(1, Math.ceil(Math.max(1, people) / seats));
  }

  /** Effective distance (km) and duration (min) of a trip, honouring overrides. */
  function tripDistance(trip, settings) {
    const km = isNum(trip.kmOverride) ? trip.kmOverride : (trip.km ?? 0);
    let min;
    if (isNum(trip.minOverride)) {
      min = trip.minOverride;
    } else if (isNum(trip.min) && !isNum(trip.kmOverride)) {
      min = trip.min * (settings.trafficFactor || 1);
    } else {
      min = (km / 18) * 60; // ~18 km/h average in HCMC traffic
    }
    return { km: Math.max(0, km || 0), min: Math.max(0, min || 0) };
  }

  /**
   * Full breakdown for one trip.
   * Per vehicle, one way:
   *   ride = (base + max(0, km − 2) × perKm + min × perMin) × surge, rounded to 1,000₫
   *   oneWay = ride + tolls + extras + tip (+ airport fee)
   * Round trip doubles everything except the airport fee.
   * Then × vehicles × repeats per day.
   */
  function calculateFare(trip, settings) {
    const rate = settings.rates[trip.vehicle] || settings.rates.bike;
    const { km, min } = tripDistance(trip, settings);
    const surge = isNum(trip.surge) && trip.surge > 0 ? trip.surge : 1;

    const hasRoute = km > 0;
    const distanceFare = hasRoute ? rate.base + Math.max(0, km - BASE_KM) * rate.perKm : 0;
    const timeFare = hasRoute ? min * rate.perMin : 0;
    const ride = roundTo1000((distanceFare + timeFare) * surge);

    const tolls = num(trip.tolls), extras = num(trip.extras), tip = num(trip.tip);
    const airport = trip.airport ? num(settings.airportFee) : 0;
    const legs = trip.roundTrip ? 2 : 1;

    const perVehicle = legs * (ride + tolls + tip) + extras + airport;
    const vehicles = vehiclesNeeded(trip.vehicle, trip.people);
    const repeats = Math.max(1, Math.round(num(trip.repeats) || 1));
    const total = hasRoute || perVehicle > 0 ? perVehicle * vehicles * repeats : 0;

    const people = Math.max(1, Math.round(num(trip.people) || 1));
    const perPerson = total / people;
    const myShares = Math.min(people, Math.max(0, num(trip.myShares ?? 1)));
    const yourShare = perPerson * myShares;

    return {
      km, min, surge, ride, distanceFare, timeFare, tolls, extras, tip, airport,
      legs, perVehicle, vehicles, repeats, total, people, perPerson, myShares, yourShare,
    };
  }

  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
  function isNum(v) { return v !== null && v !== "" && v !== undefined && Number.isFinite(Number(v)); }

  const api = { VEHICLES, SURGE_PRESETS, TIMES_OF_DAY, BASE_KM, defaultSettings, calculateFare, vehiclesNeeded, tripDistance };
  root.Pricing = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
