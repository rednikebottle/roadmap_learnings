/*
 * App state, rendering, persistence and share links.
 */
(function () {
  const { VEHICLES, SURGE_PRESETS, TIMES_OF_DAY, defaultSettings, calculateFare, vehiclesNeeded, tripDistance } = Pricing;
  const STORAGE_KEY = "grab-hcmc-calc-v1";
  const EMOJIS = ["📍", "🏨", "🍜", "☕", "🛍️", "🏛️", "✈️", "🍻", "🏖️", "💼"];

  const $ = (sel, el = document) => el.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = () => Math.random().toString(36).slice(2, 9);

  // ---------- state ----------
  let state = load();
  const routeLines = {}; // tripId -> [[lat,lng],...]; not persisted (keeps share links short)
  let editingId = null;

  function newTrip(partial = {}) {
    return {
      id: uid(), name: "", emoji: "📍",
      from: null, to: null, km: null, min: null, routeSource: null,
      kmOverride: null, minOverride: null,
      vehicle: "bike", people: 1, myShares: 1,
      timeOfDay: "midday", surgePreset: "normal", surge: 1,
      roundTrip: false, repeats: 1, airport: false,
      tolls: 0, extras: 0, tip: 0, notes: "",
      ...partial,
    };
  }

  function load() {
    const fromHash = readHash();
    if (fromHash) return fromHash;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return normalise(JSON.parse(raw));
    } catch {}
    return normalise({});
  }

  function normalise(s) {
    const d = defaultSettings();
    const settings = { ...d, ...(s.settings || {}) };
    settings.rates = { ...d.rates };
    for (const id of Object.keys(d.rates)) settings.rates[id] = { ...d.rates[id], ...(s.settings?.rates?.[id] || {}) };
    settings.fx = { ...d.fx, ...(s.settings?.fx || {}) };
    if (!["VND", "USD", "SGD"].includes(settings.currency)) settings.currency = "VND";
    const trips = Array.isArray(s.trips) ? s.trips.map((t) => newTrip({ ...t, id: t.id || uid() })) : [];
    trips.forEach((t) => { if (!VEHICLES[t.vehicle]) t.vehicle = "bike"; delete t.routeLoading; });
    return { trips, settings, days: Math.max(1, Number(s.days) || 1) };
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }

  // ---------- share links ----------
  function encodeState() {
    const bytes = new TextEncoder().encode(JSON.stringify(state));
    let bin = ""; bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function readHash() {
    const m = location.hash.match(/^#s=([A-Za-z0-9_-]+)$/);
    if (!m) return null;
    try {
      const b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
      const bin = atob(b64);
      const json = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
      history.replaceState(null, "", location.pathname + location.search);
      return normalise(JSON.parse(json));
    } catch { return null; }
  }
  async function share() {
    const url = `${location.origin}${location.pathname}#s=${encodeState()}`;
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ title: "My Grab trips in Saigon", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast("Share link copied — anyone who opens it sees these trips");
    } catch {
      prompt("Copy this link:", url);
    }
  }

  // ---------- money ----------
  const vnd = (n) => `${Math.round(n).toLocaleString("en-US")}₫`;
  function alt(n) {
    const c = state.settings.currency;
    if (c === "VND") return "";
    const rate = Number(state.settings.fx[c]) || 1;
    const v = n / rate;
    const sym = c === "USD" ? "US$" : "S$";
    return `${sym}${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  const money = (n) => {
    const a = alt(n);
    return `<span class="vnd">${vnd(n)}</span>${a ? `<span class="alt">≈ ${a}</span>` : ""}`;
  };
  const fmtKm = (km) => (km < 10 ? km.toFixed(1) : Math.round(km)) + " km";
  const fmtMin = (m) => (m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`);

  // ---------- main render ----------
  function render() {
    save();
    renderCurrency();
    renderTrips();
    renderTotals();
  }

  function renderCurrency() {
    document.querySelectorAll("[data-currency]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.currency === state.settings.currency));
  }

  function tripTitle(t) {
    if (t.name) return t.name;
    if (t.from && t.to) return `${t.from.name.split(",")[0]} → ${t.to.name.split(",")[0]}`;
    return "New trip";
  }

  function renderTrips() {
    const list = $("#trips");
    if (!state.trips.length) {
      list.innerHTML = `
        <div class="empty">
          <div class="empty-icon">🛵</div>
          <h2>Plan your rides around Saigon</h2>
          <p>Add a trip with the <b>+</b> button. Pick two places and you'll see the distance, an estimated Grab fare, and the cost per person.</p>
          <button class="btn primary" data-action="add">Add your first trip</button>
        </div>`;
      return;
    }
    list.innerHTML = state.trips.map((t) => {
      const f = calculateFare(t, state.settings);
      const v = VEHICLES[t.vehicle];
      const ready = f.km > 0;
      const tags = [
        t.roundTrip && "Round trip",
        f.repeats > 1 && `${f.repeats}× a day`,
        f.surge !== 1 && `${f.surge}× surge`,
        f.vehicles > 1 && `${f.vehicles} ${v.seats === 1 ? "bikes" : "cars"}`,
        t.airport && "Airport",
      ].filter(Boolean);
      return `
        <button class="trip" data-open="${t.id}">
          <span class="trip-emoji">${esc(t.emoji)}</span>
          <span class="trip-main">
            <span class="trip-title">${esc(tripTitle(t))}</span>
            <span class="trip-meta">${v.icon} ${v.label} · 👥 ${f.people}${ready ? ` · ${fmtKm(f.km)} · ${fmtMin(f.min)}` : ""}</span>
            ${tags.length ? `<span class="tags">${tags.map((x) => `<span class="tag">${esc(x)}</span>`).join("")}</span>` : ""}
          </span>
          <span class="trip-price">
            ${ready ? `${money(f.total)}${f.people > 1 ? `<span class="pp">${vnd(f.perPerson)} / person</span>` : ""}` : `<span class="muted">Set route →</span>`}
          </span>
        </button>`;
    }).join("");
  }

  function totals() {
    let day = 0, mine = 0;
    for (const t of state.trips) {
      const f = calculateFare(t, state.settings);
      day += f.total; mine += f.yourShare;
    }
    return { day, mine };
  }

  function renderTotals() {
    const { day, mine } = totals();
    const d = state.days;
    $("#totals").innerHTML = `
      <div class="tot">
        <span class="tot-label">Group / day</span>
        <span class="tot-val">${money(day)}</span>
      </div>
      <div class="tot">
        <span class="tot-label">You / day</span>
        <span class="tot-val accent">${money(mine)}</span>
      </div>
      <div class="tot tot-days">
        <span class="tot-label">Days</span>
        <span class="stepper small">
          <button data-days="-1" aria-label="Fewer days">−</button>
          <span>${d}</span>
          <button data-days="1" aria-label="More days">+</button>
        </span>
      </div>
      <div class="tot">
        <span class="tot-label">You · ${d} day${d > 1 ? "s" : ""}</span>
        <span class="tot-val big">${money(mine * d)}</span>
      </div>`;
  }

  // ---------- editor ----------
  function openEditor(id) {
    editingId = id;
    const t = trip();
    const ed = $("#editor");
    ed.innerHTML = editorHtml(t);
    ed.hidden = false;
    document.body.classList.add("editing");
    requestAnimationFrame(() => ed.classList.add("open"));
    $("#map-slot").appendChild($("#map"));
    TripMap.show(t, routeLines[t.id]);
    updateComputed();
    setupAutocomplete("from");
    setupAutocomplete("to");
    if (t.from && t.to && !routeLines[t.id]) refreshRoute(false);
  }

  function closeEditor() {
    const ed = $("#editor");
    ed.classList.remove("open");
    document.body.classList.remove("editing");
    $("#map-home").appendChild($("#map"));
    editingId = null;
    setTimeout(() => { if (!editingId) { ed.hidden = true; ed.innerHTML = ""; } }, 250);
    render();
  }

  const trip = () => state.trips.find((t) => t.id === editingId);

  function editorHtml(t) {
    const chip = (group, id, label, active) => `<button class="chip" data-${group}="${id}" aria-pressed="${active}">${esc(label)}</button>`;
    return `
      <div class="ed-head">
        <button class="icon-btn" data-action="close" aria-label="Back">←</button>
        <button class="emoji-btn" data-action="emoji" aria-label="Change icon">${esc(t.emoji)}</button>
        <input class="name-input" data-field="name" placeholder="${esc(tripTitle(t))}" value="${esc(t.name)}" maxlength="60" aria-label="Trip name">
        <button class="icon-btn" data-action="duplicate" title="Duplicate trip" aria-label="Duplicate trip">⧉</button>
        <button class="icon-btn danger" data-action="delete" title="Delete trip" aria-label="Delete trip">🗑</button>
      </div>

      <div class="ed-body">
        <section class="card">
          <div class="route-fields">
            <div class="ac" data-ac="from">
              <span class="dot dot-a">A</span>
              <input data-place="from" placeholder="Pickup — search a place in HCMC" value="${esc(t.from?.name || "")}" autocomplete="off">
              <ul class="ac-list" hidden></ul>
            </div>
            <button class="swap" data-action="swap" aria-label="Swap pickup and drop-off">⇅</button>
            <div class="ac" data-ac="to">
              <span class="dot dot-b">B</span>
              <input data-place="to" placeholder="Drop-off — search a place in HCMC" value="${esc(t.to?.name || "")}" autocomplete="off">
              <ul class="ac-list" hidden></ul>
            </div>
          </div>
          <div class="pick-mode">
            <span>Tap the map to set:</span>
            <button class="chip" data-pick="from" aria-pressed="${!t.from || !!(t.from && t.to)}">A Pickup</button>
            <button class="chip" data-pick="to" aria-pressed="${!!t.from && !t.to}">B Drop-off</button>
          </div>
          <div id="map-slot"></div>
          <div class="route-info" id="route-info"></div>
        </section>

        <section class="card">
          <h3>Vehicle</h3>
          <div class="vehicles" id="vehicles">
            ${Object.entries(VEHICLES).map(([id, v]) => `
              <button class="veh" data-vehicle="${id}" aria-pressed="${t.vehicle === id}">
                <span class="veh-icon">${v.icon}</span>
                <span class="veh-name">${v.label}</span>
                <span class="veh-seats">${v.seats === 1 ? "1 rider" : `${v.seats} seats`}</span>
                <span class="veh-price" data-veh-price="${id}"></span>
              </button>`).join("")}
          </div>
        </section>

        <section class="card">
          <h3>People</h3>
          <div class="row">
            <label>Travelling together</label>
            <span class="stepper"><button data-step="people" data-d="-1">−</button><span data-show="people">${t.people}</span><button data-step="people" data-d="1">+</button></span>
          </div>
          <div class="row">
            <label>Shares I'm paying for <small>e.g. 2 if you cover your partner</small></label>
            <span class="stepper"><button data-step="myShares" data-d="-1">−</button><span data-show="myShares">${t.myShares}</span><button data-step="myShares" data-d="1">+</button></span>
          </div>
          <p class="note" id="vehicle-note"></p>
        </section>

        <section class="card">
          <h3>When</h3>
          <div class="chips">${TIMES_OF_DAY.map((x) => chip("tod", x.id, x.label, t.timeOfDay === x.id)).join("")}</div>
          <h4>Surge / conditions</h4>
          <div class="chips">${SURGE_PRESETS.map((x) => chip("surge", x.id, `${x.label} ${x.surge}×`, t.surgePreset === x.id)).join("")}
            ${chip("surge", "custom", "Custom", t.surgePreset === "custom")}
          </div>
          <div class="row" id="custom-surge" ${t.surgePreset === "custom" ? "" : "hidden"}>
            <label>Multiplier</label>
            <input type="number" class="num" data-field="surge" data-type="number" step="0.1" min="0.5" max="5" value="${t.surge}">
          </div>
        </section>

        <section class="card">
          <h3>Trip options</h3>
          <label class="row toggle"><span>Round trip <small>doubles the ride</small></span><input type="checkbox" data-field="roundTrip" ${t.roundTrip ? "checked" : ""}></label>
          <div class="row">
            <label>Times per day <small>e.g. a daily commute</small></label>
            <span class="stepper"><button data-step="repeats" data-d="-1">−</button><span data-show="repeats">${t.repeats}</span><button data-step="repeats" data-d="1">+</button></span>
          </div>
          <label class="row toggle"><span>Tan Son Nhat airport pickup <small>+${vnd(state.settings.airportFee)}</small></span><input type="checkbox" data-field="airport" ${t.airport ? "checked" : ""}></label>
        </section>

        <section class="card">
          <h3>Extra costs <small>(₫, per vehicle)</small></h3>
          <div class="row"><label>Tolls <small>per leg</small></label><input type="number" class="num" data-field="tolls" data-type="number" min="0" step="5000" value="${t.tolls || ""}" placeholder="0"></div>
          <div class="row"><label>Tip <small>per leg</small></label><input type="number" class="num" data-field="tip" data-type="number" min="0" step="5000" value="${t.tip || ""}" placeholder="0"></div>
          <div class="row"><label>Other <small>parking, waiting…</small></label><input type="number" class="num" data-field="extras" data-type="number" min="0" step="5000" value="${t.extras || ""}" placeholder="0"></div>
        </section>

        <section class="card">
          <h3>Manual overrides</h3>
          <div class="row"><label>Distance (km) <small>leave empty to use the route</small></label><input type="number" class="num" data-field="kmOverride" data-type="number" min="0" step="0.1" value="${t.kmOverride ?? ""}" placeholder="${t.km ? t.km.toFixed(1) : "auto"}"></div>
          <div class="row"><label>Ride time (min)</label><input type="number" class="num" data-field="minOverride" data-type="number" min="0" step="1" value="${t.minOverride ?? ""}" placeholder="auto"></div>
          <textarea data-field="notes" placeholder="Notes (e.g. book GrabCar if raining)" rows="2">${esc(t.notes)}</textarea>
        </section>

        <section class="card breakdown" id="breakdown"></section>
      </div>

      <div class="ed-foot">
        <button class="btn primary block" data-action="close">Done</button>
      </div>`;
  }

  /** Update the parts of the editor that depend on calculations (without rebuilding inputs). */
  function updateComputed() {
    const t = trip();
    if (!t) return;
    const f = calculateFare(t, state.settings);
    const v = VEHICLES[t.vehicle];
    const ed = $("#editor");

    // route info
    const ri = $("#route-info", ed);
    if (t.routeLoading) ri.innerHTML = `<span class="muted">Finding the best road route…</span>`;
    else if (f.km > 0) {
      const badge = t.kmOverride != null && t.kmOverride !== ""
        ? `<span class="badge">manual</span>`
        : t.routeSource === "estimate" ? `<span class="badge warn" title="Road routing was unavailable, so this is straight-line distance × 1.3">≈ estimate</span>` : `<span class="badge ok">road route</span>`;
      ri.innerHTML = `<b>${fmtKm(f.km)}</b> · about ${fmtMin(f.min)} in traffic ${badge}`;
    } else ri.innerHTML = `<span class="muted">Search two places or tap the map to set A and B.</span>`;

    // vehicle prices
    ed.querySelectorAll("[data-veh-price]").forEach((el) => {
      const id = el.dataset.vehPrice;
      const alt = calculateFare({ ...t, vehicle: id }, state.settings);
      el.textContent = alt.km > 0 ? vnd(alt.total) : "";
    });

    // vehicle note
    const note = $("#vehicle-note", ed);
    if (f.vehicles > 1) {
      note.innerHTML = v.seats === 1
        ? `🛵 ${f.people} people means <b>${f.vehicles} bikes</b> (one each), and the total covers all of them. For groups, compare against a GrabCar above.`
        : `⚠️ ${f.people} people don't fit in one ${v.label} (${v.seats} seats), so this books <b>${f.vehicles} cars</b>.${f.people <= 7 && t.vehicle !== "car7" ? " A 7-seater may be cheaper." : ""}`;
      note.hidden = false;
    } else note.hidden = true;

    // breakdown
    const rows = [];
    const rate = state.settings.rates[t.vehicle];
    if (f.km > 0) {
      rows.push([`Base (first 2 km)`, vnd(rate.base)]);
      if (f.km > 2) rows.push([`${(f.km - 2).toFixed(1)} km × ${vnd(rate.perKm)}`, vnd((f.km - 2) * rate.perKm)]);
      rows.push([`${Math.round(f.min)} min × ${vnd(rate.perMin)}`, vnd(f.timeFare)]);
      if (f.surge !== 1) rows.push([`Surge × ${f.surge}`, ""]);
      rows.push([`<b>Ride fare</b> (rounded)`, `<b>${vnd(f.ride)}</b>`]);
    }
    if (f.tolls) rows.push(["Tolls", vnd(f.tolls)]);
    if (f.tip) rows.push(["Tip", vnd(f.tip)]);
    if (f.legs > 1) rows.push(["Round trip", "× 2"]);
    if (f.airport) rows.push(["Airport pickup", vnd(f.airport)]);
    if (f.extras) rows.push(["Other extras", vnd(f.extras)]);
    if (f.vehicles > 1) rows.push([`${f.vehicles} vehicles`, `× ${f.vehicles}`]);
    if (f.repeats > 1) rows.push([`${f.repeats} times a day`, `× ${f.repeats}`]);

    $("#breakdown", ed).innerHTML = `
      <h3>Price breakdown</h3>
      <table>${rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join("")}</table>
      <div class="bd-totals">
        <div><span>Trip total</span>${money(f.total)}</div>
        <div><span>Per person (${f.people})</span>${money(f.perPerson)}</div>
        <div class="accent"><span>You pay${f.myShares !== 1 ? ` (${f.myShares} shares)` : ""}</span>${money(f.yourShare)}</div>
      </div>`;

    ed.querySelectorAll("[data-show]").forEach((el) => (el.textContent = t[el.dataset.show]));
    ed.querySelectorAll("[data-vehicle]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.vehicle === t.vehicle));
    ed.querySelectorAll("[data-tod]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.tod === t.timeOfDay));
    ed.querySelectorAll("[data-surge]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.surge === t.surgePreset));
    $("#custom-surge", ed).hidden = t.surgePreset !== "custom";
    const name = $(".name-input", ed); if (name) name.placeholder = tripTitle({ ...t, name: "" });
    save();
  }

  async function refreshRoute(updateDistance = true) {
    const t = trip();
    if (!t || !t.from || !t.to) { if (t) TripMap.show(t, null); updateComputed(); return; }
    const id = t.id;
    if (updateDistance) { t.routeLoading = true; updateComputed(); }
    const r = await Geo.route(t.from, t.to);
    const cur = state.trips.find((x) => x.id === id);
    if (!cur) return;
    delete cur.routeLoading;
    routeLines[id] = r.line;
    if (updateDistance || cur.km == null) { cur.km = r.km; cur.min = r.min; cur.routeSource = r.source; }
    if (editingId === id) { TripMap.show(cur, r.line); updateComputed(); }
    save();
  }

  function setPlace(which, place) {
    const t = trip();
    t[which] = place;
    const input = $(`[data-place="${which}"]`);
    if (input) input.value = place ? place.name : "";
    if (!(t.from && t.to)) { t.km = t.min = null; t.routeSource = null; delete routeLines[t.id]; }
    TripMap.show(t, null);
    // next map tap goes to whichever end is still missing
    const next = !t.from ? "from" : !t.to ? "to" : which === "from" ? "to" : "from";
    document.querySelectorAll("[data-pick]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.pick === next));
    refreshRoute(true);
  }

  // ---------- autocomplete ----------
  function setupAutocomplete(which) {
    const wrap = $(`[data-ac="${which}"]`);
    const input = $("input", wrap), list = $(".ac-list", wrap);
    let timer, ctrl, results = [], active = -1;

    const close = () => { list.hidden = true; active = -1; };
    const draw = () => {
      list.innerHTML = results.length
        ? results.map((r, i) => `<li role="option" data-i="${i}" class="${i === active ? "active" : ""}"><b>${esc(r.name)}</b><small>${esc(r.full)}</small></li>`).join("")
        : `<li class="muted">No places found in HCMC</li>`;
      list.hidden = false;
    };
    const pick = (i) => { const r = results[i]; if (!r) return; close(); setPlace(which, { name: r.name, lat: r.lat, lng: r.lng }); };

    input.addEventListener("input", () => {
      clearTimeout(timer); ctrl?.abort();
      const q = input.value;
      if (q.trim().length < 3) { close(); return; }
      list.innerHTML = `<li class="muted">Searching…</li>`; list.hidden = false;
      timer = setTimeout(async () => {
        ctrl = new AbortController();
        try { results = await Geo.searchPlaces(q, ctrl.signal); active = -1; draw(); }
        catch (e) { if (e.name !== "AbortError") { list.innerHTML = `<li class="muted">Search unavailable — tap the map instead</li>`; } }
      }, 700);
    });
    input.addEventListener("keydown", (e) => {
      if (list.hidden || !results.length) return;
      if (e.key === "ArrowDown") { active = Math.min(results.length - 1, active + 1); draw(); e.preventDefault(); }
      else if (e.key === "ArrowUp") { active = Math.max(0, active - 1); draw(); e.preventDefault(); }
      else if (e.key === "Enter") { pick(active < 0 ? 0 : active); e.preventDefault(); }
      else if (e.key === "Escape") close();
    });
    list.addEventListener("mousedown", (e) => {
      const li = e.target.closest("li[data-i]");
      if (li) { e.preventDefault(); pick(Number(li.dataset.i)); }
    });
    input.addEventListener("blur", () => setTimeout(() => {
      close();
      const t = trip();
      if (t && document.activeElement !== input) input.value = t[which]?.name || "";
    }, 150));
  }

  // ---------- settings ----------
  function openSettings() {
    const s = state.settings;
    $("#settings-body").innerHTML = `
      <p class="note">Grab doesn't publish official prices. These defaults are approximate HCMC rates. Change them if the app quotes you something different.</p>
      <div class="rates">
        <div class="rates-head"><span>Vehicle</span><span>First 2 km</span><span>Per km</span><span>Per min</span></div>
        ${Object.entries(VEHICLES).map(([id, v]) => `
          <div class="rates-row">
            <span>${v.icon} ${v.label}</span>
            ${["base", "perKm", "perMin"].map((k) => `<input type="number" min="0" step="100" data-rate="${id}.${k}" value="${s.rates[id][k]}" aria-label="${v.label} ${k}">`).join("")}
          </div>`).join("")}
      </div>
      <div class="row"><label>Airport pickup fee (₫)</label><input type="number" class="num" min="0" step="1000" data-setting="airportFee" value="${s.airportFee}"></div>
      <div class="row"><label>Traffic factor <small>× the routing service's free-road time</small></label><input type="number" class="num" min="1" max="4" step="0.1" data-setting="trafficFactor" value="${s.trafficFactor}"></div>
      <div class="row"><label>₫ per 1 US$</label><input type="number" class="num" min="1" step="10" data-fx="USD" value="${s.fx.USD}"></div>
      <div class="row"><label>₫ per 1 S$</label><input type="number" class="num" min="1" step="10" data-fx="SGD" value="${s.fx.SGD}"></div>
      <button class="btn" data-action="reset-settings">Reset to defaults</button>
      <div class="sources">
        <h4>Sources</h4>
        <ul>
          <li><a href="https://viettelstore.vn/tin-tuc/grab-bao-nhieu-tien-1km" target="_blank" rel="noopener">Viettel Store: Grab bao nhiêu tiền 1km? (Dec 2025)</a>, HCMC fare table</li>
          <li><a href="https://daytripsvietnam.com/guides/vietnam-grab-prices-2026/" target="_blank" rel="noopener">Day Trips Vietnam: Grab Prices 2026</a>, cross-check, airport fee, surge, USD rate</li>
          <li><a href="https://www.worldforexrates.com/sgd/vnd/1-exchange-rate/" target="_blank" rel="noopener">worldforexrates.com</a>, SGD rate (Nov 2026)</li>
          <li>Places: <a href="https://nominatim.openstreetmap.org/" target="_blank" rel="noopener">OpenStreetMap Nominatim</a> · Routes: <a href="https://project-osrm.org/" target="_blank" rel="noopener">OSRM</a></li>
        </ul>
      </div>`;
    $("#settings").showModal();
  }

  // ---------- events ----------
  function addTrip() {
    const last = state.trips[state.trips.length - 1];
    // a new trip starts where the last one ended, with the same group size
    const t = newTrip(last ? { from: last.to, people: last.people, myShares: last.myShares, vehicle: last.vehicle } : {});
    state.trips.push(t);
    render();
    openEditor(t.id);
  }

  document.addEventListener("click", (e) => {
    const el = e.target.closest("button, [data-open]");
    if (!el) return;
    const t = trip();

    if (el.dataset.action === "add") return addTrip();
    if (el.dataset.open) return openEditor(el.dataset.open);
    if (el.dataset.currency) { state.settings.currency = el.dataset.currency; render(); if (t) updateComputed(); return; }
    if (el.dataset.days) { state.days = Math.max(1, Math.min(365, state.days + Number(el.dataset.days))); renderTotals(); save(); return; }
    if (el.dataset.action === "share") return share();
    if (el.dataset.action === "settings") return openSettings();
    if (el.dataset.action === "close-settings") { $("#settings").close(); return; }
    if (el.dataset.action === "reset-settings") {
      if (confirm("Reset all rates and exchange rates to the defaults?")) {
        const currency = state.settings.currency;
        state.settings = { ...defaultSettings(), currency };
        openSettings(); render();
      }
      return;
    }
    if (el.dataset.action === "clear-all") {
      if (state.trips.length && confirm("Delete all trips?")) { state.trips = []; render(); }
      return;
    }

    if (!t) return;
    switch (el.dataset.action) {
      case "close": return closeEditor();
      case "delete":
        if (confirm(`Delete "${tripTitle(t)}"?`)) { state.trips = state.trips.filter((x) => x.id !== t.id); closeEditor(); }
        return;
      case "duplicate": {
        const copy = newTrip({ ...structuredClone(t), id: uid(), name: t.name ? `${t.name} (copy)` : "" });
        routeLines[copy.id] = routeLines[t.id];
        state.trips.splice(state.trips.indexOf(t) + 1, 0, copy);
        render(); openEditor(copy.id); toast("Trip duplicated");
        return;
      }
      case "swap": {
        [t.from, t.to] = [t.to, t.from];
        $('[data-place="from"]').value = t.from?.name || "";
        $('[data-place="to"]').value = t.to?.name || "";
        delete routeLines[t.id];
        refreshRoute(true);
        return;
      }
      case "emoji": {
        t.emoji = EMOJIS[(EMOJIS.indexOf(t.emoji) + 1) % EMOJIS.length];
        el.textContent = t.emoji; save(); return;
      }
    }
    if (el.dataset.vehicle) { t.vehicle = el.dataset.vehicle; return updateComputed(); }
    if (el.dataset.step) {
      const k = el.dataset.step, d = Number(el.dataset.d);
      const max = k === "myShares" ? t.people : 50;
      t[k] = Math.max(k === "myShares" ? 0 : 1, Math.min(max, (Number(t[k]) || 0) + d));
      if (k === "people" && t.myShares > t.people) t.myShares = t.people;
      return updateComputed();
    }
    if (el.dataset.tod) {
      t.timeOfDay = el.dataset.tod;
      const preset = TIMES_OF_DAY.find((x) => x.id === t.timeOfDay).preset;
      // don't overwrite a deliberate rain / holiday / custom choice
      if (!["rain", "holiday", "custom"].includes(t.surgePreset)) {
        t.surgePreset = preset; t.surge = SURGE_PRESETS.find((x) => x.id === preset).surge;
      }
      return updateComputed();
    }
    if (el.dataset.surge) {
      t.surgePreset = el.dataset.surge;
      if (t.surgePreset !== "custom") t.surge = SURGE_PRESETS.find((x) => x.id === t.surgePreset).surge;
      else { const inp = $('[data-field="surge"]'); if (inp) inp.value = t.surge; }
      return updateComputed();
    }
    if (el.dataset.pick) {
      document.querySelectorAll("[data-pick]").forEach((b) => b.setAttribute("aria-pressed", b === el));
    }
  });

  document.addEventListener("input", (e) => {
    const el = e.target;
    if (el.dataset.rate) {
      const [id, k] = el.dataset.rate.split(".");
      state.settings.rates[id][k] = Math.max(0, Number(el.value) || 0); render(); return;
    }
    if (el.dataset.setting) { state.settings[el.dataset.setting] = Math.max(0, Number(el.value) || 0); render(); return; }
    if (el.dataset.fx) { state.settings.fx[el.dataset.fx] = Math.max(1, Number(el.value) || 1); render(); return; }

    const t = trip();
    if (!t || !el.dataset.field) return;
    const k = el.dataset.field;
    if (el.type === "checkbox") t[k] = el.checked;
    else if (el.dataset.type === "number") {
      const isOverride = k === "kmOverride" || k === "minOverride";
      t[k] = el.value === "" ? (isOverride ? null : 0) : Math.max(0, Number(el.value));
    } else t[k] = el.value;
    updateComputed();
  });

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg; el.classList.add("show");
    clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("show"), 2600);
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && editingId && !$("#settings").open && !e.target.closest(".ac")) closeEditor();
  });

  // ---------- boot ----------
  TripMap.init($("#map"), (lat, lng) => {
    const t = trip(); if (!t) return;
    const which = document.querySelector('[data-pick][aria-pressed="true"]')?.dataset.pick || (!t.from ? "from" : "to");
    const place = { name: "Dropped pin…", lat, lng };
    setPlace(which, place);
    Geo.reverseGeocode(lat, lng).then((name) => {
      if (t[which] === place) {
        place.name = name;
        const input = $(`[data-place="${which}"]`); if (input && editingId === t.id) input.value = name;
        if (editingId === t.id) updateComputed(); else render();
      }
    });
  });
  render();
})();
