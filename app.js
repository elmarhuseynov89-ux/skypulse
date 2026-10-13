/* SkyPulse — brauzer tərəfi. Hava: Open-Meteo, zəlzələ: USGS, xəritə: Leaflet + OpenStreetMap.
   Telegram və planlı yoxlama server.py-dədir (bot tokeni heç vaxt bu fayla düşmür). */
(function () {
  "use strict";
  const C = window.SKYPULSE_CONFIG;
  const I18N = window.SKYPULSE_I18N;
  const TECH = window.SKYPULSE_TECH || {};

  // ---------- kiçik köməkçilər ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem("sp_" + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("sp_" + k, JSON.stringify(v)); } catch (e) { /* yaddaş bağlıdır */ } }
  };
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const round = (v, d = 0) => (v == null || isNaN(v) ? "–" : Number(v).toFixed(d));
  const DEMO = window.SKYPULSE_DEMO || null; // yalnız onlayn nümayiş versiyasında olur
  const HAS_SERVER = !DEMO && location.protocol.startsWith("http");

  const S = {
    lang: store.get("lang", "az"),
    view: (location.hash || "#home").slice(1),
    place: store.get("place", null) || Object.assign({ isDefault: true }, C.defaultPlace),
    wx: null, wxErr: null, wxTime: null, wxCached: false, wxLoading: false,
    quakes: null, quakeErr: null,
    rules: null,
    saved: store.get("saved", []),
    monitors: store.get("monitors", []),
    monStatus: {}, server: null,
    trip: store.get("trip", null),
    tripRes: null, tripLoading: false, tripErr: null,
    sector: store.get("sector", "restaurant"),
    histYears: 10, hist: null, histLoading: false, histErr: null,
    world: null, layers: { radar: true, cities: true, quakes: true }
  };
  if (!["home", "map", "trip", "business", "settings"].includes(S.view)) S.view = "home";
  const t = (k) => (I18N[S.lang] && I18N[S.lang][k]) || I18N.en[k] || k;

  // ---------- ikonlar ----------
  const NAV_ICONS = {
    home: '<path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    map: '<path d="m9 4-6 2v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
    trip: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5"/>',
    business: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 14.3H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1.3z"/>'
  };
  const navSvg = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${NAV_ICONS[k]}</svg>`;

  function wcGroup(code) {
    if (code == null) return "cloudy";
    if (code === 0) return "clear";
    if (code <= 2) return "partly";
    if (code === 3) return "cloudy";
    if (code === 45 || code === 48) return "fog";
    if (code >= 51 && code <= 57) return "drizzle";
    if (code >= 61 && code <= 67) return "rain";
    if (code >= 71 && code <= 77) return "snow";
    if (code >= 80 && code <= 82) return "showers";
    if (code === 85 || code === 86) return "snow";
    if (code >= 95) return "storm";
    return "cloudy";
  }
  function wxIcon(code) {
    const g = wcGroup(code);
    const sun = '<circle cx="16" cy="16" r="6" fill="#F5B820"/><g stroke="#F5B820" stroke-width="2" stroke-linecap="round"><path d="M16 3v3M16 26v3M3 16h3M26 16h3M6.8 6.8l2.1 2.1M23.1 23.1l2.1 2.1M6.8 25.2l2.1-2.1M23.1 8.9l2.1-2.1"/></g>';
    const cloud = (x = 0, y = 0, c = "#A9BCD8") => `<path transform="translate(${x} ${y})" d="M10 26h14a6 6 0 0 0 0-12 8 8 0 0 0-15-1 6.5 6.5 0 0 0 1 13z" fill="${c}"/>`;
    const drops = '<g stroke="#4D8DF0" stroke-width="2" stroke-linecap="round"><path d="M12 28l-1.5 3M18 28l-1.5 3M24 28l-1.5 3"/></g>';
    const flakes = '<g fill="#BFD8FF"><circle cx="12" cy="29.5" r="1.6"/><circle cx="18" cy="30.5" r="1.6"/><circle cx="24" cy="29.5" r="1.6"/></g>';
    let inner;
    switch (g) {
      case "clear": inner = sun; break;
      case "partly": inner = '<g transform="translate(-4 -5) scale(.8)">' + sun + "</g>" + cloud(2, 2); break;
      case "cloudy": inner = cloud(0, 0); break;
      case "fog": inner = cloud(0, -3) + '<g stroke="#A9BCD8" stroke-width="2" stroke-linecap="round"><path d="M6 27h20M9 31h16"/></g>'; break;
      case "drizzle": case "rain": case "showers": inner = cloud(0, -3) + drops; break;
      case "snow": inner = cloud(0, -3) + flakes; break;
      case "storm": inner = cloud(0, -4, "#8095B5") + '<path d="M17 21l-4 6h4l-2 5 6-8h-4l2-3z" fill="#F5B820"/>'; break;
    }
    return `<svg viewBox="0 0 32 32" aria-hidden="true">${inner}</svg>`;
  }
  const wcText = (code) => t("wc_" + wcGroup(code));

  // ---------- şəbəkə ----------
  async function fetchJSON(url, ms = 15000) {
    if (DEMO) return DEMO.fetch(url);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(url, { signal: ctl.signal });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } finally { clearTimeout(timer); }
  }
  const wxCache = new Map();
  function weatherUrl(lat, lon) {
    return "https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lon +
      "&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,is_day" +
      "&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,wind_gusts_10m,visibility" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum,wind_gusts_10m_max,precipitation_probability_max" +
      "&timezone=auto&forecast_days=16";
  }
  async function getWeather(lat, lon) {
    const key = lat.toFixed(2) + "," + lon.toFixed(2);
    const hit = wxCache.get(key);
    if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.data; // 10 dəq keş
    const data = await fetchJSON(weatherUrl(lat, lon));
    wxCache.set(key, { at: Date.now(), data });
    return data;
  }
  async function getMarine(lat, lon) {
    return fetchJSON("https://marine-api.open-meteo.com/v1/marine?latitude=" + lat + "&longitude=" + lon +
      "&hourly=wave_height&daily=wave_height_max&timezone=auto&forecast_days=16");
  }
  async function geocode(q) {
    const lang = S.lang === "az" ? "az" : S.lang;
    const d = await fetchJSON("https://geocoding-api.open-meteo.com/v1/search?count=6&format=json&language=" + lang + "&name=" + encodeURIComponent(q), 10000);
    return (d.results || []).map((r) => ({ name: r.name, country: r.country || "", admin: r.admin1 || "", lat: r.latitude, lon: r.longitude }));
  }
  function usgsUrl(path, lat, lon, opt) {
    return "https://earthquake.usgs.gov/fdsnws/event/1/" + path + "?format=geojson&latitude=" + lat + "&longitude=" + lon +
      "&maxradiuskm=" + opt.radius + "&minmagnitude=" + opt.minmag + "&starttime=" + opt.start +
      (opt.orderby ? "&orderby=" + opt.orderby : "") + (opt.limit ? "&limit=" + opt.limit : "");
  }
  const isoDay = (d) => d.toISOString().slice(0, 10);
  async function getQuakes(lat, lon, days, minmag) {
    const R = S.rules;
    const start = isoDay(new Date(Date.now() - days * 864e5));
    const d = await fetchJSON(usgsUrl("query", lat, lon, { radius: R.quake_radius_km, minmag, start, orderby: "time", limit: 50 }));
    return (d.features || []).map(quakeOf);
  }
  function quakeOf(f) {
    const p = f.properties || {}, g = (f.geometry && f.geometry.coordinates) || [];
    return { id: f.id, mag: p.mag, place: p.place, time: p.time, url: p.url, lon: g[0], lat: g[1], depth: g[2] };
  }

  // ---------- risk qaydaları (server.py ilə eyni rules.json) ----------
  function levelUp(v, th) { if (v == null || isNaN(v)) return 0; let l = 0; th.forEach((x, i) => { if (v >= x) l = i + 1; }); return l; }
  function levelDown(v, th) { if (v == null || isNaN(v)) return 0; let l = 0; th.forEach((x, i) => { if (v <= x) l = i + 1; }); return l; }
  function visMinByDate(wx) {
    const out = {};
    const h = wx.hourly || {};
    (h.time || []).forEach((tm, i) => {
      const v = h.visibility ? h.visibility[i] : null;
      if (v == null) return;
      const d = tm.slice(0, 10);
      if (out[d] == null || v < out[d]) out[d] = v;
    });
    return out;
  }
  // from/to: "YYYY-MM-DD" (daxil olmaqla). Nəticə: [{type, level, date, value, unit}]
  function dailyRisks(wx, from, to, marine) {
    const R = S.rules, d = wx.daily || {}, out = [];
    const vis = visMinByDate(wx);
    (d.time || []).forEach((date, i) => {
      if ((from && date < from) || (to && date > to)) return;
      const add = (type, level, value, unit) => { if (level > 0) out.push({ type, level, date, value, unit }); };
      add("gust", levelUp(d.wind_gusts_10m_max[i], R.gust_kmh), d.wind_gusts_10m_max[i], "km/h");
      add("precip", levelUp(d.precipitation_sum[i], R.precip_day_mm), d.precipitation_sum[i], "mm");
      add("snow", levelUp(d.snowfall_sum[i], R.snow_day_cm), d.snowfall_sum[i], "cm");
      add("heat", levelUp(d.temperature_2m_max[i], R.heat_c), d.temperature_2m_max[i], "°C");
      add("cold", levelDown(d.temperature_2m_min[i], R.cold_c), d.temperature_2m_min[i], "°C");
      add("visibility", levelDown(vis[date], R.visibility_m), vis[date], "m");
      if (R.thunder_codes.includes(d.weather_code[i])) add("thunder", R.thunder_level, null, "");
    });
    if (marine && marine.daily) {
      (marine.daily.time || []).forEach((date, i) => {
        if ((from && date < from) || (to && date > to)) return;
        const v = marine.daily.wave_height_max[i];
        const l = levelUp(v, R.wave_m);
        if (l > 0) out.push({ type: "wave", level: l, date, value: v, unit: "m" });
      });
    }
    return out.sort((a, b) => b.level - a.level || a.date.localeCompare(b.date));
  }
  const dayName = (date) => t("d" + new Date(date + "T12:00:00").getDay());
  const shortDate = (date) => date.slice(8, 10) + "." + date.slice(5, 7);
  function riskRow(r, extra) {
    const val = r.value == null ? "" : ` · <span class="num">${round(r.value, r.unit === "m" && r.type === "wave" ? 1 : 0)} ${esc(r.unit)}</span>`;
    return `<div class="risk l${r.level}"><div><span class="chip l${r.level}">${t("lvl" + r.level)}</span></div>
      <div><b>${t("r_" + r.type)}</b>${val}<div class="small muted">${dayName(r.date)} ${shortDate(r.date)}${extra ? " · " + esc(extra) : ""}</div></div></div>`;
  }

  // ---------- server ----------
  async function api(path, opts) {
    if (!HAS_SERVER) throw new Error("no-server");
    const r = await fetch(path, Object.assign({ headers: { "Content-Type": "application/json" } }, opts || {}));
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "HTTP " + r.status);
    return j;
  }
  async function checkServer() {
    try { S.server = await api("/api/health"); } catch (e) { S.server = { ok: false }; }
  }
  let lastStatusAt = 0;
  async function refreshMonitors(force) {
    if (!S.monitors.length || !HAS_SERVER) return;
    if (!force && Date.now() - lastStatusAt < 10000) return;
    lastStatusAt = Date.now();
    try {
      const j = await api("/api/monitors?codes=" + S.monitors.map((m) => m.code).join(","));
      (j.monitors || []).forEach((m) => { S.monStatus[m.code] = m; });
      if (S.view === "home" || S.view === "settings") render();
    } catch (e) { /* server işləmir */ }
  }

  // ---------- yüklənmə ----------
  async function loadPlace() {
    S.wxLoading = true; S.wxErr = null; S.quakes = null; S.quakeErr = null; render();
    const p = S.place;
    try {
      S.wx = await getWeather(p.lat, p.lon);
      S.wxTime = new Date(); S.wxCached = false;
      store.set("wxLast", { key: p.lat + "," + p.lon, wx: S.wx, at: S.wxTime.toISOString() });
    } catch (e) {
      const last = store.get("wxLast", null);
      if (last && last.key === p.lat + "," + p.lon) { S.wx = last.wx; S.wxTime = new Date(last.at); S.wxCached = true; }
      else { S.wx = null; S.wxErr = t("err_network"); }
    }
    S.wxLoading = false; render();
    try { S.quakes = await getQuakes(p.lat, p.lon, 7, S.rules.quake_min_mag); }
    catch (e) { S.quakeErr = t("err_network"); }
    render();
  }
  function setPlace(p) {
    S.place = { name: p.name, country: p.country || "", admin: p.admin || "", lat: +p.lat, lon: +p.lon };
    store.set("place", S.place);
    S.hist = null;
    loadPlace();
  }

  // ---------- naviqasiya ----------
  const VIEWS = ["home", "map", "trip", "business", "settings"];
  function renderNav() {
    const html = VIEWS.map((v) => `<button class="tab" data-nav="${v}" ${S.view === v ? 'aria-current="page"' : ""}>${navSvg(v)}<span>${t("nav_" + v)}</span></button>`).join("");
    $("#tabs").innerHTML = html; $("#rail").innerHTML = html;
  }
  function go(v) { S.view = v; history.replaceState(null, "", "#" + v); render(); window.scrollTo(0, 0); }

  // ---------- görünüşlər ----------
  function promosHtml() {
    const P = C.promos || {};
    const items = ["course", "kunefe"].filter((k) => P[k] && P[k].enabled).map((k) => {
      const p = P[k], txt = (p.text && (p.text[S.lang] || p.text.en)) || "";
      const inner = `<b>${esc(p.title)}</b><span>${esc(txt)}</span>`;
      return p.link ? `<a class="promo" href="${esc(p.link)}" target="_blank" rel="noopener">${inner}</a>` : `<div class="promo">${inner}</div>`;
    });
    return (items.length ? `<div class="promos">${items.join("")}</div>` : "") + `<p class="footer">${t("footer_sources")}</p>`;
  }
  function placeLabel(p) { return [p.admin, p.country].filter(Boolean).join(", "); }

  // ---------- rəng köməkçiləri ----------
  const T_STOPS = [[-20, [106, 90, 205]], [-5, [59, 130, 246]], [5, [6, 182, 212]], [15, [34, 197, 94]], [24, [234, 179, 8]], [32, [249, 115, 22]], [40, [220, 38, 38]]];
  function tempColor(v) {
    if (v == null || isNaN(v)) return "#8FA6C8";
    if (v <= T_STOPS[0][0]) return "rgb(" + T_STOPS[0][1] + ")";
    for (let i = 1; i < T_STOPS.length; i++) {
      const [t1, c1] = T_STOPS[i];
      if (v <= t1) {
        const [t0, c0] = T_STOPS[i - 1], k = (v - t0) / (t1 - t0);
        return "rgb(" + c0.map((x, j) => Math.round(x + (c1[j] - x) * k)).join(",") + ")";
      }
    }
    return "rgb(" + T_STOPS[T_STOPS.length - 1][1] + ")";
  }
  function skyClass(code, isDay) {
    const g = wcGroup(code);
    if (g === "storm") return "sky-storm";
    if (g === "snow") return "sky-snow";
    if (g === "rain" || g === "drizzle" || g === "showers") return "sky-rain";
    if (g === "fog" || g === "cloudy") return isDay === 0 ? "sky-night" : "sky-cloud";
    return isDay === 0 ? "sky-night" : (g === "partly" ? "sky-partly" : "sky-clear");
  }

  // ---------- dünya şəhərləri ----------
  const WORLD = [
    ["Bakı", "Baku", "Баку", 40.4093, 49.8671], ["İstanbul", "Istanbul", "Стамбул", 41.0138, 28.9497], ["Dubay", "Dubai", "Дубай", 25.2048, 55.2708],
    ["London", "London", "Лондон", 51.5085, -0.1257], ["Nyu-York", "New York", "Нью-Йорк", 40.7143, -74.006], ["Tokio", "Tokyo", "Токио", 35.6895, 139.6917],
    ["Moskva", "Moscow", "Москва", 55.7522, 37.6156], ["Tbilisi", "Tbilisi", "Тбилиси", 41.6941, 44.8337], ["Paris", "Paris", "Париж", 48.8534, 2.3488],
    ["Qahirə", "Cairo", "Каир", 30.0626, 31.2497]
  ];
  const cityName = (c) => c[S.lang === "en" ? 1 : S.lang === "ru" ? 2 : 0];
  async function loadWorld() {
    if (S.world && Date.now() - S.world.at < 15 * 60 * 1000) return;
    try {
      const url = "https://api.open-meteo.com/v1/forecast?latitude=" + WORLD.map((c) => c[3]).join(",") + "&longitude=" + WORLD.map((c) => c[4]).join(",") + "&current=temperature_2m,weather_code,is_day&timezone=auto";
      let d = await fetchJSON(url);
      if (!Array.isArray(d)) d = [d];
      S.world = { at: Date.now(), items: d.map((x, i) => ({ c: WORLD[i], cur: x.current || {} })) };
    } catch (e) { S.world = { at: Date.now(), items: [], err: true }; }
    if (S.view === "home" || S.view === "map") render();
  }
  function worldStrip() {
    if (!S.world) return `<div class="world">${WORLD.slice(0, 6).map(() => '<div class="city skel-city"></div>').join("")}</div>`;
    if (!S.world.items.length) return `<p class="muted small">${t("err_network")}</p>`;
    return `<div class="world">${S.world.items.map((w, i) => `<button class="city" data-act="pick-world" data-i="${i}" style="--tc:${tempColor(w.cur.temperature_2m)}">
      <span class="city-n">${esc(cityName(w.c))}</span>${wxIcon(w.cur.weather_code)}<span class="city-t num">${round(w.cur.temperature_2m)}°</span></button>`).join("")}</div>`;
  }

  // ---------- radar (RainViewer, pulsuz, açarsız) ----------
  let radarMeta = null;
  async function getRadar() {
    if (DEMO) return null;
    if (radarMeta && Date.now() - radarMeta.at < 10 * 60 * 1000) return radarMeta;
    try {
      const r = await fetch("https://api.rainviewer.com/public/weather-maps.json");
      const j = await r.json();
      const last = j.radar && j.radar.past && j.radar.past[j.radar.past.length - 1];
      radarMeta = last ? { at: Date.now(), url: j.host + last.path + "/256/{z}/{x}/{y}/4/1_1.png", time: last.time * 1000 } : null;
    } catch (e) { radarMeta = null; }
    return radarMeta;
  }
  const darkMode = () => document.documentElement.dataset.theme === "dark" || (!document.documentElement.dataset.theme && window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches);
  function baseTiles(m) {
    if (DEMO) return;
    const style = darkMode() ? "dark_all" : "rastertiles/voyager";
    L.tileLayer("https://{s}.basemaps.cartocdn.com/" + style + "/{z}/{x}/{y}{r}.png", { maxZoom: 18, subdomains: "abcd", attribution: "© OpenStreetMap © CARTO" }).addTo(m);
  }
  function tempBubble(temp, label) {
    return L.divIcon({ className: "", iconSize: null, html: `<div class="bubble" style="--tc:${tempColor(temp)}"><b>${round(temp)}°</b>${label ? `<span>${esc(label)}</span>` : ""}</div>` });
  }

  function viewHome() {
    const p = S.place, wx = S.wx;
    let hero;
    if (S.wxLoading && !wx) {
      hero = `<section class="hero sky-clear"><div class="place">${esc(p.name)}</div><p><span class="spin"></span> ${t("loading")}</p></section>`;
    } else if (!wx) {
      hero = `<section class="hero sky-cloud"><div class="place">${esc(p.name)}</div><p>${esc(S.wxErr)}</p><button class="btn glass" data-act="reload">${t("retry")}</button></section>`;
    } else {
      const c = wx.current || {};
      const tmax = wx.daily.temperature_2m_max[0], tmin = wx.daily.temperature_2m_min[0];
      hero = `<section class="hero ${skyClass(c.weather_code, c.is_day)}">
        <div class="hero-top"><div><div class="place">${esc(p.name)}</div>
        <div class="sub">${esc(placeLabel(p))}${p.isDefault ? " · " + t("default_place") : ""}</div></div>
        <div class="sub right">${t("updated")} <span class="num">${S.wxTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>${S.wxCached ? "<br>" + t("cached") : ""}</div></div>
        <div class="hero-row"><div class="hero-icon">${wxIcon(c.weather_code)}</div><div class="temp num">${round(c.temperature_2m)}°</div>
          <div class="hero-desc"><div class="cond">${wcText(c.weather_code)}</div><div class="sub">${t("feels")} <span class="num">${round(c.apparent_temperature)}°</span> · <span class="num">↑${round(tmax)}° ↓${round(tmin)}°</span></div></div></div>
        <div class="metrics">
          <div class="metric m-wind"><div class="k">${t("wind")}</div><div class="v num">${round(c.wind_speed_10m)}<small> km/h</small></div></div>
          <div class="metric m-gust"><div class="k">${t("gusts")}</div><div class="v num">${round(c.wind_gusts_10m)}<small> km/h</small></div></div>
          <div class="metric m-hum"><div class="k">${t("humidity")}</div><div class="v num">${round(c.relative_humidity_2m)}<small>%</small></div></div>
          <div class="metric m-rain"><div class="k">${t("precip")}</div><div class="v num">${round(c.precipitation, 1)}<small> mm</small></div></div>
        </div>
        <div class="hero-actions">
          <button class="btn bright" data-act="monitor-place">🔔 ${t("monitor_this")}</button>
          <button class="btn glass" data-act="save-place">★ ${t("save_place")}</button>
          <button class="btn glass" data-nav="trip">${t("plan_trip")}</button>
          <button class="btn glass" data-act="geo">◎ ${t("my_location")}</button>
        </div></section>`;
    }

    let risks = "", days = "", hours = "";
    if (wx) {
      const today = wx.daily.time[0], to3 = wx.daily.time[2];
      const list = dailyRisks(wx, today, to3);
      risks = list.length ? `<div class="risk-list">${list.map((r) => riskRow(r)).join("")}</div>` : `<div class="okbox">✓ ${t("risk_none")}</div>`;
      const d7 = wx.daily.time.slice(0, 7);
      const lo = Math.min(...d7.map((_, i) => wx.daily.temperature_2m_min[i])), hi = Math.max(...d7.map((_, i) => wx.daily.temperature_2m_max[i]));
      const span = Math.max(1, hi - lo);
      days = d7.map((d, i) => {
        const mn = wx.daily.temperature_2m_min[i], mx = wx.daily.temperature_2m_max[i];
        const left = ((mn - lo) / span) * 100, width = Math.max(6, ((mx - mn) / span) * 100);
        return `<div class="drow"><span class="dn">${i === 0 ? t("now") : dayName(d)}</span><span class="di">${wxIcon(wx.daily.weather_code[i])}</span>
          <span class="dp num">${wx.daily.precipitation_sum[i] > 0 ? round(wx.daily.precipitation_sum[i], 1) + " mm" : ""}</span>
          <span class="num dmin">${round(mn)}°</span><span class="bar"><i style="left:${left}%;width:${width}%;background:linear-gradient(90deg,${tempColor(mn)},${tempColor(mx)})"></i></span><span class="num dmax">${round(mx)}°</span></div>`;
      }).join("");
      const nowKey = (wx.current && wx.current.time) ? wx.current.time.slice(0, 13) : "";
      let start = wx.hourly.time.findIndex((x) => x.slice(0, 13) >= nowKey); if (start < 0) start = 0;
      hours = wx.hourly.time.slice(start, start + 24).map((tm, k) => {
        const i = start + k, tv = wx.hourly.temperature_2m[i];
        return `<div class="hour" style="--tc:${tempColor(tv)}"><div class="num small">${k === 0 ? t("now") : tm.slice(11, 16)}</div>${wxIcon(wx.hourly.weather_code[i])}<div class="num ht">${round(tv)}°</div><div class="small num pp">💧${round(wx.hourly.precipitation_probability[i])}%</div></div>`;
      }).join("");
    }

    let quakes;
    if (S.quakeErr) quakes = `<p class="muted">${esc(S.quakeErr)}</p>`;
    else if (!S.quakes) quakes = `<div class="skel"></div><div class="skel" style="width:70%"></div>`;
    else if (!S.quakes.length) quakes = `<div class="okbox">✓ ${t("quakes_none")}</div>`;
    else quakes = `<div class="list">${S.quakes.slice(0, 5).map((q) => `<div class="row"><span class="mag" style="--mc:${q.mag >= 5 ? "var(--r)" : q.mag >= 4 ? "var(--o)" : "var(--y)"}">${round(q.mag, 1)}</span><div class="main grow"><span class="small">${esc(q.place)}</span><div class="small muted num">${new Date(q.time).toLocaleString()}</div></div><a class="small" href="${esc(q.url)}" target="_blank" rel="noopener">USGS</a></div>`).join("")}</div>`;

    const saved = S.saved.length ? `<div class="chips">${S.saved.map((s, i) => `<span class="pchip"><button class="link-btn" data-act="pick-saved" data-i="${i}">${esc(s.name)}</button><button class="x" data-act="del-saved" data-i="${i}" aria-label="${t("remove")}">×</button></span>`).join("")}</div>` : `<p class="muted small">${t("saved_none")}</p>`;
    const active = Object.values(S.monStatus).filter((m) => m.status === "active").length;

    return `${S.wxCached ? `<div class="banner">${t("offline")}</div>` : ""}
      <div class="stack">${hero}
      <section class="panel"><div class="panel-h"><h2>🌍 ${t("world")}</h2><span class="small muted">Open-Meteo</span></div>${worldStrip()}</section>
      <div class="grid two">
        <div class="stack">
          <section class="panel"><div class="panel-h"><h2>⚠️ ${t("risk_summary")}</h2></div>${wx ? risks : '<div class="skel"></div>'}<p class="note">${t("risk_note")}</p></section>
          <section class="panel"><div class="panel-h"><h2>🕒 ${t("next24")}</h2></div><div class="hours">${hours || '<div class="skel"></div>'}</div></section>
          <section class="panel"><div class="panel-h"><h2>📅 ${t("forecast7")}</h2></div><div class="days">${days || '<div class="skel"></div>'}</div></section>
        </div>
        <div class="stack">
          <section class="panel map-card"><div class="panel-h"><h2>🗺️ ${t("live_map")}</h2><button class="link-btn small" data-nav="map">${t("open_map")} →</button></div><div id="miniMap"></div><p class="note">${t("radar_note")}</p></section>
          <section class="panel tg-card ${active ? "on" : ""}"><div class="row"><span><b>✈️ ${t("tg_status")}</b><div class="small">${active ? t("tg_linked") + " · " + active : t("tg_not_linked")}</div></span><button class="btn bright" data-act="monitor-place">${t("monitor_this")}</button></div></section>
          <section class="panel"><div class="panel-h"><h2>🌐 ${t("quakes")}</h2></div>${quakes}<p class="note">${t("quake_note")}</p></section>
          <section class="panel"><div class="panel-h"><h2>🏛️ ${t("official")}</h2></div><div class="info">${t("official_none")}</div></section>
          <section class="panel"><div class="panel-h"><h2>★ ${t("saved")}</h2></div>${saved}</section>
        </div>
      </div></div>${promosHtml()}`;
  }

  // ----- xəritə -----
  let map = null, mapLayer = null, miniMap = null;
  function viewMap() {
    const yrs = [5, 10, 20].map((y) => `<option value="${y}" ${S.histYears === y ? "selected" : ""}>${y} ${t("years")}</option>`).join("");
    let hist = "";
    if (S.histLoading) hist = `<p><span class="spin"></span> ${t("loading")}</p>`;
    else if (S.histErr) hist = `<p class="muted">${esc(S.histErr)}</p>`;
    else if (S.hist) hist = `<p><b class="num">${S.hist.count}</b> ${t("hist_count")}</p><div class="list">${S.hist.items.slice(0, 10).map((q) => `<div class="row"><span class="mag" style="--mc:${q.mag >= 6 ? "var(--r)" : "var(--o)"}">${round(q.mag, 1)}</span><div class="main grow"><span class="small">${esc(q.place)}</span><div class="small muted num">${new Date(q.time).toLocaleDateString()}</div></div><a class="small" href="${esc(q.url)}" target="_blank" rel="noopener">USGS</a></div>`).join("")}</div>`;
    const lay = S.layers;
    const tog = (k, label) => `<button type="button" class="ltog" data-layer="${k}" aria-pressed="${!!lay[k]}">${label}</button>`;
    return `<div class="stack"><section class="panel map-panel">
      <div class="map-wrap"><div id="map"></div>
        <div class="map-ctl">${tog("radar", "🌧️ " + t("lay_radar"))}${tog("cities", "🌡️ " + t("lay_temp"))}${tog("quakes", "🌐 " + t("lay_quake"))}</div>
      </div>
      <div class="legend"><span class="tscale"><i></i><em>-20°</em><em>0°</em><em>20°</em><em>40°</em></span>
        <span><i class="dot" style="background:#E36A0B"></i>${t("lg_quake")}</span><span><i class="dot" style="background:#7A4FD1"></i>${t("lg_hist")}</span></div>
      <p class="note">${t("radar_note")} · ${t("footer_sources")}${radarMeta ? " · RainViewer " + new Date(radarMeta.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</p></section>
      <section class="panel"><div class="panel-h"><h2>${t("history")}</h2></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><div class="field" style="flex:0 0 140px"><select id="histYears">${yrs}</select></div><button class="btn primary" data-act="hist">${t("show")}</button></div>
        ${hist}<p class="note">${t("hist_note")}</p></section></div>`;
  }
  function addLayers(m, layer, full) {
    const p = S.place, c = S.wx && S.wx.current;
    if (!full || S.layers.radar) getRadar().then((r) => { if (r && m._loaded !== false) L.tileLayer(r.url, { opacity: .65, maxNativeZoom: 7, maxZoom: 18, attribution: "RainViewer" }).addTo(layer); });
    if (!full || S.layers.cities) (S.world ? S.world.items : []).forEach((w) => L.marker([w.c[3], w.c[4]], { icon: tempBubble(w.cur.temperature_2m, full ? cityName(w.c) : "") }).addTo(layer));
    if (!full || S.layers.quakes) (S.quakes || []).forEach((q) => L.circleMarker([q.lat, q.lon], { radius: 3 + q.mag * 2, color: "#E36A0B", weight: 1, fillColor: "#E36A0B", fillOpacity: .5 })
      .bindPopup(`M${round(q.mag, 1)} · ${esc(q.place)}<br>${new Date(q.time).toLocaleString()}<br><a href="${esc(q.url)}" target="_blank" rel="noopener">USGS</a>`).addTo(layer));
    if (full && S.hist) S.hist.items.forEach((q) => L.circleMarker([q.lat, q.lon], { radius: 3 + q.mag * 1.6, color: "#7A4FD1", weight: 1, fillColor: "#7A4FD1", fillOpacity: .4 })
      .bindPopup(`M${round(q.mag, 1)} · ${esc(q.place)}<br>${new Date(q.time).toLocaleDateString()}`).addTo(layer));
    S.saved.forEach((s) => L.circleMarker([s.lat, s.lon], { radius: 6, color: "#fff", weight: 2, fillColor: "#7C3AED", fillOpacity: 1 }).bindPopup(esc(s.name)).addTo(layer));
    L.marker([p.lat, p.lon], { icon: L.divIcon({ className: "", iconSize: null, html: `<div class="bubble me" style="--tc:${tempColor(c && c.temperature_2m)}"><b>${c ? round(c.temperature_2m) + "°" : "•"}</b><span>${esc(p.name)}</span></div>` }) })
      .bindPopup(`<b>${esc(p.name)}</b>${c ? `<br>${round(c.temperature_2m)}° · ${wcText(c.weather_code)}<br>${t("gusts")}: ${round(c.wind_gusts_10m)} km/h` : ""}`).addTo(layer);
  }
  function mountMap() {
    const el = document.getElementById("map");
    if (!el) return;
    if (typeof L === "undefined") { el.innerHTML = `<p class="info">${t("err_network")}</p>`; return; }
    if (map) { map.remove(); map = null; }
    const p = S.place;
    map = L.map("map", { worldCopyJump: true }).setView([p.lat, p.lon], 5);
    baseTiles(map);
    mapLayer = L.layerGroup().addTo(map);
    if (S.rules) L.circle([p.lat, p.lon], { radius: S.rules.quake_radius_km * 1000, color: "#7C3AED", weight: 1, fill: false, dashArray: "4 6" }).addTo(mapLayer);
    addLayers(map, mapLayer, true);
  }
  function mountMiniMap() {
    const el = document.getElementById("miniMap");
    if (!el || typeof L === "undefined") return;
    if (miniMap) { miniMap.remove(); miniMap = null; }
    const p = S.place;
    miniMap = L.map("miniMap", { zoomControl: false, attributionControl: true, scrollWheelZoom: false }).setView([p.lat, p.lon], 4);
    baseTiles(miniMap);
    addLayers(miniMap, L.layerGroup().addTo(miniMap), false);
  }
  async function loadHistory() {
    S.histYears = +$("#histYears").value; S.histLoading = true; S.histErr = null; render();
    const p = S.place, start = isoDay(new Date(Date.now() - S.histYears * 365.25 * 864e5));
    const opt = { radius: S.rules.quake_radius_km, minmag: 4.5, start };
    try {
      const [cnt, list] = await Promise.all([
        fetchJSON(usgsUrl("count", p.lat, p.lon, opt)),
        fetchJSON(usgsUrl("query", p.lat, p.lon, Object.assign({ orderby: "magnitude", limit: 200 }, opt)))
      ]);
      S.hist = { count: cnt.count, items: (list.features || []).map(quakeOf) };
    } catch (e) { S.histErr = t("err_network"); }
    S.histLoading = false; render();
  }

  // ----- səfər -----
  const HAZ = ["gust", "precip", "snow", "heat", "cold", "visibility", "thunder", "wave", "quake"];
  function defaultTrip() {
    const d = new Date(Date.now() + 864e5); d.setHours(9, 0, 0, 0);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
    return { from: Object.assign({}, S.place), to: null, depart: local, arrive: "", mode: "road", hazards: HAZ.filter((h) => h !== "wave") };
  }
  function viewTrip() {
    if (!S.trip) S.trip = defaultTrip();
    const tr = S.trip;
    const modes = ["road", "air", "sea"].map((m) => `<button type="button" data-mode="${m}" aria-pressed="${tr.mode === m}">${t("m_" + m)}</button>`).join("");
    const hz = HAZ.map((h) => `<label><input type="checkbox" data-haz="${h}" ${tr.hazards.includes(h) ? "checked" : ""}> ${t("r_" + h)}</label>`).join("");
    let res = "";
    if (S.tripLoading) res = `<section class="panel"><span class="spin"></span> ${t("loading")}</section>`;
    else if (S.tripErr) res = `<section class="panel"><p>${esc(S.tripErr)}</p></section>`;
    else if (S.tripRes) res = tripResultHtml(S.tripRes);
    return `<div class="stack"><section class="panel"><div class="panel-h"><h2>${t("trip_title")}</h2></div>
      <form class="form cols" id="tripForm" autocomplete="off">
        <div class="field"><label for="tFrom">${t("from")}</label><input id="tFrom" value="${esc(tr.from ? tr.from.name : "")}" placeholder="${t("search_ph")}"><div class="results" id="tFromRes" hidden></div></div>
        <div class="field"><label for="tTo">${t("to")}</label><input id="tTo" value="${esc(tr.to ? tr.to.name : "")}" placeholder="${t("search_ph")}"><div class="results" id="tToRes" hidden></div></div>
        <div class="field"><label for="tDep">${t("depart")}</label><input id="tDep" type="datetime-local" value="${esc(tr.depart)}" required></div>
        <div class="field"><label for="tArr">${t("arrive")}</label><input id="tArr" type="datetime-local" value="${esc(tr.arrive)}"></div>
        <div class="field"><span class="label">${t("mode")}</span><div class="seg">${modes}</div></div>
        <div class="field" style="grid-column:1/-1"><span class="label">${t("hazards")}</span><div class="checks">${hz}</div></div>
        <div style="grid-column:1/-1"><button class="btn primary" type="submit">${t("analyze")}</button></div>
      </form></section>${res}
      <p class="note">${t("trip_limits")}</p></div>`;
  }
  function haversine(a, b) {
    const R = 6371, toR = (x) => x * Math.PI / 180;
    const dLat = toR(b.lat - a.lat), dLon = toR(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  async function analyzeTrip() {
    const tr = S.trip;
    if (!tr.from || !tr.to || tr.from.lat == null || tr.to.lat == null) { S.tripErr = t("choose_place"); render(); return; }
    S.tripLoading = true; S.tripErr = null; S.tripRes = null; render();
    try {
      const pts = [{ role: "trip_origin", p: tr.from, time: tr.depart }];
      if (tr.mode === "road") pts.push({ role: "trip_mid", p: { name: "", lat: (tr.from.lat + tr.to.lat) / 2, lon: (tr.from.lon + tr.to.lon) / 2 }, time: null });
      pts.push({ role: "trip_dest", p: tr.to, time: tr.arrive || tr.depart });
      const from = tr.depart.slice(0, 10), to = (tr.arrive || tr.depart).slice(0, 10);
      for (const x of pts) {
        x.wx = await getWeather(x.p.lat, x.p.lon);
        if (tr.mode === "sea" && x.role !== "trip_mid") { try { x.marine = await getMarine(x.p.lat, x.p.lon); } catch (e) { x.marine = null; } }
        if (tr.hazards.includes("quake") && x.role !== "trip_mid") { try { x.quakes = (await getQuakes(x.p.lat, x.p.lon, 7, S.rules.quake_alert_mag)); } catch (e) { x.quakes = null; } }
        x.risks = dailyRisks(x.wx, from, to, x.marine).filter((r) => tr.hazards.includes(r.type));
        const last = x.wx.daily.time[x.wx.daily.time.length - 1];
        x.beyond = from > last;
      }
      S.tripRes = { pts, dist: haversine(tr.from, tr.to), mode: tr.mode };
    } catch (e) { S.tripErr = t("err_network"); }
    S.tripLoading = false; render();
  }
  function tripResultHtml(res) {
    const cards = res.pts.map((x) => {
      const wx = x.wx;
      let atHour = "";
      if (x.time) {
        const i = wx.hourly.time.indexOf(x.time.slice(0, 13) + ":00");
        if (i >= 0) atHour = `<div class="row"><span>${t("at_time")} <span class="num">${x.time.slice(11, 16)}</span></span><span>${wxIcon(wx.hourly.weather_code[i]).replace("<svg", '<svg width="24" height="24"')} <span class="num">${round(wx.hourly.temperature_2m[i])}° · ${round(wx.hourly.wind_gusts_10m[i])} km/h · ${round(wx.hourly.precipitation[i], 1)} mm</span></span></div>`;
      }
      let marine = "";
      if (res.mode === "sea" && x.role !== "trip_mid") {
        const mi = x.marine && x.marine.daily ? x.marine.daily.wave_height_max.findIndex((v) => v != null) : -1;
        marine = mi >= 0 ? `<div class="row"><span>${t("waves")}</span><span class="num">${round(x.marine.daily.wave_height_max[mi], 1)} m</span></div>` : `<p class="small muted">${t("marine_none")}</p>`;
      }
      const qs = x.quakes && x.quakes.length ? x.quakes.map((q) => riskRow({ type: "quake", level: q.mag >= 6 ? 3 : 2, date: new Date(q.time).toISOString().slice(0, 10), value: q.mag, unit: "M" }, q.place)).join("") : "";
      const risks = x.risks.length || qs ? `<div class="risk-list">${x.risks.map((r) => riskRow(r)).join("")}${qs}</div>` : `<div class="info">${t("risk_none")}</div>`;
      const name = x.role === "trip_mid" ? `<span class="small muted">${round(x.p.lat, 2)}, ${round(x.p.lon, 2)} · ${t("trip_not_route")}</span>` : esc(x.p.name);
      return `<section class="panel"><div class="panel-h"><h2>${t(x.role)}</h2><span>${name}</span></div>
        ${x.beyond ? `<div class="banner">${t("trip_beyond")}</div>` : ""}${atHour}${marine}${risks}</section>`;
    }).join("");
    return `<section class="panel"><div class="row"><span>${t("trip_dist")}</span><span class="num">${round(res.dist)} km</span></div><p class="note">${t("trip_not_route")} ${t("risk_note")}</p>
      <button class="btn primary" data-act="monitor-trip">${t("monitor_trip")}</button></section>${cards}`;
  }

  // ----- biznes -----
  function viewBusiness() {
    const sectors = ["restaurant", "construction", "logistics"].map((s) => `<button type="button" data-sector="${s}" aria-pressed="${S.sector === s}">${t("s_" + s)}</button>`).join("");
    let body = `<div class="skel"></div>`;
    if (S.wx) {
      const risks = dailyRisks(S.wx, S.wx.daily.time[0], S.wx.daily.time[2]);
      const rows = risks.map((r) => ({ r, msg: I18N[S.lang]["b_" + S.sector + "_" + r.type] })).filter((x) => x.msg);
      const seen = new Set();
      const uniq = rows.filter((x) => { if (seen.has(x.r.type)) return false; seen.add(x.r.type); return true; });
      body = uniq.length ? `<div class="risk-list">${uniq.map((x) => `<div class="risk l${x.r.level}"><div><span class="chip l${x.r.level}">${t("lvl" + x.r.level)}</span></div><div><b>${t("r_" + x.r.type)}</b> · <span class="small muted">${dayName(x.r.date)} ${shortDate(x.r.date)}</span><div>${esc(x.msg)}</div></div></div>`).join("")}</div>` : `<div class="info">${t("biz_none")}</div>`;
    } else if (S.wxErr) body = `<p>${esc(S.wxErr)}</p>`;
    return `<div class="stack"><section class="panel"><div class="panel-h"><h2>${t("biz_title")}</h2><span class="small muted">${t("biz_for")}: <b>${esc(S.place.name)}</b></span></div>
      <div class="field"><span class="label">${t("sector")}</span><div class="seg">${sectors}</div></div></section>
      <section class="panel">${body}<p class="note">${t("biz_note")}</p></section></div>`;
  }

  // ----- ayarlar -----
  function viewSettings() {
    const srv = S.server;
    const srvRow = `<div class="row"><span>${t("server")}</span><span class="chip ${srv && srv.ok ? "ok" : "off"}">${srv == null ? t("loading") : srv.ok ? t("server_ok") : "—"}</span></div>
      ${srv && !srv.ok ? `<p class="small muted">${DEMO ? t("demo_tg") : t("server_off")}</p>` : ""}
      ${srv && srv.ok ? `<div class="row"><span>${t("bot_name")}</span><span class="num">${srv.bot_username ? "@" + esc(srv.bot_username) : "—"}</span></div>` : ""}`;
    const mons = S.monitors.length ? `<div class="list">${S.monitors.map((m) => {
      const st = S.monStatus[m.code];
      const status = st ? st.status : "pending";
      const chip = status === "active" ? "ok" : "off";
      return `<div class="row"><div class="main"><b>${esc(m.name)}</b><div class="small muted">${t("st_" + status)}${st && st.end_at ? " · → " + esc(st.end_at.slice(0, 16).replace("T", " ")) : ""}</div></div>
        <div style="display:flex;gap:8px;align-items:center"><span class="chip ${chip}">${t("st_" + status)}</span>
        ${status === "pending" && m.link ? `<a class="small" href="${esc(m.link)}" target="_blank" rel="noopener">${t("open_tg")}</a>` : ""}
        ${status === "active" || status === "pending" ? `<button class="link-btn small" data-act="stop-mon" data-code="${esc(m.code)}">${t("stop")}</button>` : `<button class="link-btn small" data-act="forget-mon" data-code="${esc(m.code)}">${t("remove")}</button>`}</div></div>`;
    }).join("")}</div>` : `<p class="muted small">${t("monitors_none")}</p>`;
    const rows = (TECH[S.lang] || TECH.en || []).map((r) => `<tr><td><b>${esc(r[0])}</b></td><td>${esc(r[1])}</td><td>${esc(r[2])}</td><td>${esc(r[3])}</td></tr>`).join("");
    return `<div class="stack">
      <section class="panel"><div class="panel-h"><h2>${t("set_title")}</h2></div>
        <div class="row"><label for="lang2">${t("language")}</label><select id="lang2" class="btn"><option value="az" ${S.lang === "az" ? "selected" : ""}>Azərbaycan</option><option value="en" ${S.lang === "en" ? "selected" : ""}>English</option><option value="ru" ${S.lang === "ru" ? "selected" : ""}>Русский</option></select></div>
        ${srvRow}</section>
      <section class="panel"><div class="panel-h"><h2>${t("my_monitors")}</h2></div>${mons}</section>
      <section class="panel"><div class="panel-h"><h2>${t("tech_title")}</h2></div>
        <div class="tbl-wrap"><table><thead><tr><th>${t("t_tool")}</th><th>${t("t_where")}</th><th>${t("t_what")}</th><th>${t("t_status")}</th></tr></thead><tbody>${rows}</tbody></table></div></section>
      ${promosHtml()}</div>`;
  }

  // ----- monitorinq pəncərəsi -----
  let monTarget = null;
  function openMonitor(target) {
    monTarget = target;
    const iv = [30, 60, 120, 360, 1440].map((v) => `<option value="${v}" ${v === 120 ? "selected" : ""}>${t("i" + v)}</option>`).join("");
    const lv = [1, 2, 3].map((v) => `<option value="${v}">${t("lvl" + v)}+</option>`).join("");
    const m = $("#modal");
    m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="monH"><h2 id="monH">${t("mon_title")}</h2>
      <p class="small muted">${esc(target.name)}</p>
      ${!HAS_SERVER ? `<div class="banner">${DEMO ? t("demo_tg") : t("server_off")}</div>` : ""}
      <form class="form" id="monForm">
        <div class="field"><label for="mIv">${t("interval")}</label><select id="mIv">${iv}</select></div>
        <div class="field"><label for="mDays">${t("days")}</label><input id="mDays" type="number" min="1" max="16" value="${target.days || 3}"></div>
        <div class="field"><label for="mLv">${t("min_level")}</label><select id="mLv">${lv}</select></div>
        <label class="small" style="display:flex;gap:8px;align-items:center"><input id="mOnly" type="checkbox" checked> ${t("only_changes")}</label>
        <p class="note">${t("urgent_note")}</p>
        <div id="monOut"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" type="submit" ${HAS_SERVER ? "" : "disabled"}>${t("create_link")}</button><button class="btn" type="button" data-act="close-modal">${t("cancel")}</button></div>
      </form></div>`;
    m.hidden = false;
    $("#mIv").focus();
  }
  async function submitMonitor() {
    const out = $("#monOut");
    const body = Object.assign({}, monTarget, {
      lang: S.lang, interval_min: +$("#mIv").value, days: Math.max(1, Math.min(16, +$("#mDays").value || 3)),
      min_level: +$("#mLv").value, only_changes: $("#mOnly").checked
    });
    out.innerHTML = `<p><span class="spin"></span> ${t("loading")}</p>`;
    try {
      const j = await api("/api/monitors", { method: "POST", body: JSON.stringify(body) });
      S.monitors.unshift({ code: j.code, name: monTarget.name, link: j.link, created: Date.now() });
      store.set("monitors", S.monitors);
      out.innerHTML = `<div class="info">${t("mon_step")}</div><p class="small">${t("mon_manual")}</p><div class="code">${esc(j.link)}</div>
        <p><a class="btn primary" href="${esc(j.link)}" target="_blank" rel="noopener">${t("open_tg")}</a></p>`;
      window.open(j.link, "_blank", "noopener");
    } catch (e) {
      out.innerHTML = `<div class="banner">${esc(e.message === "no-server" ? t("server_off") : e.message)}</div>`;
    }
  }

  // ---------- render ----------
  function render() {
    document.documentElement.lang = S.lang;
    $("#lang").value = S.lang;
    $("#q").placeholder = t("search_ph");
    renderNav();
    const v = S.view;
    const demoBar = DEMO ? `<div class="banner"><b>DEMO</b> · ${t("demo_banner")}</div>` : "";
    const html = demoBar + (v === "home" ? viewHome() : v === "map" ? viewMap() : v === "trip" ? viewTrip() : v === "business" ? viewBusiness() : viewSettings());
    const keepFocus = document.activeElement && document.activeElement.id;
    if (v !== "map" || !document.getElementById("map")) { $("#view").innerHTML = html; if (v === "map") mountMap(); }
    else { $("#view").innerHTML = html; mountMap(); }
    if (v === "home") { if (miniMap) { miniMap.remove(); miniMap = null; } mountMiniMap(); }
    if (v === "trip") bindTripSearch();
    if (keepFocus && document.getElementById(keepFocus) && keepFocus !== "q") { try { document.getElementById(keepFocus).focus(); } catch (e) { /* */ } }
    if (v === "home" || v === "settings") refreshMonitors(false);
  }

  // ---------- axtarış ----------
  function debounce(fn, ms) { let h; return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); }; }
  function attachSearch(input, box, onPick) {
    let results = [];
    const run = debounce(async () => {
      const q = input.value.trim();
      if (q.length < 2) { box.hidden = true; return; }
      box.hidden = false; box.innerHTML = `<button disabled><span class="spin"></span> ${t("loading")}</button>`;
      try {
        results = await geocode(q);
        box.innerHTML = results.length ? results.map((r, i) => `<button type="button" data-i="${i}"><b>${esc(r.name)}</b> <span class="small muted">${esc([r.admin, r.country].filter(Boolean).join(", "))}</span></button>`).join("") : `<button disabled>${t("search_none")}</button>`;
      } catch (e) { box.innerHTML = `<button disabled>${t("err_network")}</button>`; }
    }, 350);
    input.addEventListener("input", run);
    box.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-i]"); if (!b) return;
      const r = results[+b.dataset.i]; box.hidden = true; input.value = r.name; onPick(r);
    });
    input.addEventListener("keydown", (e) => { if (e.key === "Escape") box.hidden = true; });
  }
  function bindTripSearch() {
    attachSearch($("#tFrom"), $("#tFromRes"), (r) => { S.trip.from = r; store.set("trip", S.trip); });
    attachSearch($("#tTo"), $("#tToRes"), (r) => { S.trip.to = r; store.set("trip", S.trip); });
    $("#tDep").addEventListener("change", (e) => { S.trip.depart = e.target.value; store.set("trip", S.trip); });
    $("#tArr").addEventListener("change", (e) => { S.trip.arrive = e.target.value; store.set("trip", S.trip); });
  }

  // ---------- hadisələr ----------
  document.addEventListener("click", (e) => {
    const nav = e.target.closest("[data-nav]");
    if (nav) { go(nav.dataset.nav); return; }
    if (!e.target.closest(".search") && !e.target.closest(".field")) document.querySelectorAll(".results").forEach((b) => { b.hidden = true; });
    const a = e.target.closest("[data-act]");
    if (e.target.id === "modal") { $("#modal").hidden = true; return; }
    const mode = e.target.closest("[data-mode]");
    if (mode) { S.trip.mode = mode.dataset.mode; if (S.trip.mode === "sea" && !S.trip.hazards.includes("wave")) S.trip.hazards.push("wave"); store.set("trip", S.trip); render(); return; }
    const lt = e.target.closest("[data-layer]");
    if (lt) { S.layers[lt.dataset.layer] = !S.layers[lt.dataset.layer]; render(); return; }
    const sec = e.target.closest("[data-sector]");
    if (sec) { S.sector = sec.dataset.sector; store.set("sector", S.sector); render(); return; }
    if (!a) return;
    const act = a.dataset.act;
    if (act === "reload") loadPlace();
    else if (act === "save-place") {
      if (!S.saved.some((s) => s.lat === S.place.lat && s.lon === S.place.lon)) { S.saved.push(S.place); store.set("saved", S.saved); }
      toast(t("added")); render();
    } else if (act === "pick-saved") setPlace(S.saved[+a.dataset.i]);
    else if (act === "del-saved") { S.saved.splice(+a.dataset.i, 1); store.set("saved", S.saved); render(); }
    else if (act === "geo") {
      if (!navigator.geolocation) { toast(t("err_geo")); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => setPlace({ name: t("my_location"), lat: +pos.coords.latitude.toFixed(4), lon: +pos.coords.longitude.toFixed(4) }),
        () => toast(t("err_geo")), { timeout: 10000 });
    } else if (act === "monitor-place") openMonitor({ kind: "place", name: S.place.name, lat: S.place.lat, lon: S.place.lon });
    else if (act === "monitor-trip") {
      const tr = S.trip;
      const days = Math.max(1, Math.ceil(((tr.arrive ? new Date(tr.arrive) : new Date(tr.depart)) - Date.now()) / 864e5) + 1);
      openMonitor({ kind: "trip", name: tr.from.name + " → " + tr.to.name, lat: tr.from.lat, lon: tr.from.lon, name2: tr.to.name, lat2: tr.to.lat, lon2: tr.to.lon,
        mode: tr.mode, depart: tr.depart, arrive: tr.arrive, hazards: tr.hazards, days: Math.min(16, days) });
    } else if (act === "close-modal") $("#modal").hidden = true;
    else if (act === "hist") loadHistory();
    else if (act === "stop-mon") {
      api("/api/monitors/" + encodeURIComponent(a.dataset.code) + "/stop", { method: "POST" }).then(() => refreshMonitors(true)).catch((err) => toast(err.message === "no-server" ? t("server_off") : err.message));
    } else if (act === "forget-mon") { S.monitors = S.monitors.filter((m) => m.code !== a.dataset.code); store.set("monitors", S.monitors); render(); }
  });
  document.addEventListener("change", (e) => {
    if (e.target.id === "lang" || e.target.id === "lang2") { S.lang = e.target.value; store.set("lang", S.lang); render(); }
    const hz = e.target.dataset && e.target.dataset.haz;
    if (hz) { const set = new Set(S.trip.hazards); e.target.checked ? set.add(hz) : set.delete(hz); S.trip.hazards = [...set]; store.set("trip", S.trip); }
  });
  document.addEventListener("submit", (e) => {
    e.preventDefault();
    if (e.target.id === "tripForm") analyzeTrip();
    if (e.target.id === "monForm") submitMonitor();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#modal").hidden) $("#modal").hidden = true; });

  let toastTimer;
  function toast(msg) { const el = $("#toast"); el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2500); }

  // ---------- başlanğıc ----------
  async function init() {
    attachSearch($("#q"), $("#qres"), setPlace);
    render();
    try { S.rules = await fetchJSON("rules.json", 5000); }
    catch (e) { S.rules = { gust_kmh: [50, 70, 90], precip_day_mm: [15, 30, 50], snow_day_cm: [2, 10, 25], heat_c: [35, 38, 42], cold_c: [-5, -15, -25], visibility_m: [1000, 500, 200], wave_m: [1.5, 2.5, 4], thunder_codes: [95, 96, 99], thunder_level: 2, quake_radius_km: 300, quake_min_mag: 2.5, quake_alert_mag: 4.5 }; }
    checkServer().then(() => { if (S.view === "settings") render(); });
    loadPlace();
    loadWorld();
    refreshMonitors(true);
    setInterval(() => refreshMonitors(true), 30000);
    window.addEventListener("online", () => loadPlace());
    if ("serviceWorker" in navigator && HAS_SERVER) navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  // Test üçün ixrac (brauzerdə istifadə olunmur)
  window.__skypulse = { dailyRisks, levelUp, levelDown, S };
  init();
})();
