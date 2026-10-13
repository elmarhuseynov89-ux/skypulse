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
    world: null, layers: { radar: true, cities: true, quakes: true }, savedWx: [], alertFilter: "all"
  };
  if (!["home", "map", "trip", "business", "alerts", "settings"].includes(S.view)) S.view = "home";
  const t = (k) => (I18N[S.lang] && I18N[S.lang][k]) || I18N.en[k] || k;

  // ---------- ikonlar ----------
  const NAV_ICONS = {
    home: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    map: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18"/>',
    trip: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5"/>',
    business: '<path d="M3 21h18M5 21V8l7-4 7 4v13"/><path d="M9 21v-5h6v5M9 11h.01M15 11h.01"/>',
    alerts: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 14.3H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1.3z"/>',
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9z"/>',
    locate: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="7"/>'
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
  function wxIcon(code) { // monoxətli, sakit ikonlar
    const g = wcGroup(code);
    const sun = (cx = 16, cy = 16, r = 5) => `<circle cx="${cx}" cy="${cy}" r="${r}" stroke="#F5B83D"/><g stroke="#F5B83D">${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => { const k = a * Math.PI / 180, r1 = r + 3, r2 = r + 5.5; return `<path d="M${(cx + Math.cos(k) * r1).toFixed(1)} ${(cy + Math.sin(k) * r1).toFixed(1)}L${(cx + Math.cos(k) * r2).toFixed(1)} ${(cy + Math.sin(k) * r2).toFixed(1)}"/>`; }).join("")}</g>`;
    const cloud = (y = 0) => `<path transform="translate(0 ${y})" d="M10 25h13.5a5.5 5.5 0 0 0 .6-10.97A7.5 7.5 0 0 0 9.6 15.2 5 5 0 0 0 10 25z" stroke="#AEBBD6" fill="var(--icon-fill,transparent)"/>`;
    let inner;
    switch (g) {
      case "clear": inner = sun(); break;
      case "partly": inner = sun(12, 11, 4) + cloud(2); break;
      case "cloudy": inner = cloud(0); break;
      case "fog": inner = cloud(-3) + '<path d="M7 27h18M10 30.5h12" stroke="#AEBBD6"/>'; break;
      case "drizzle": case "rain": case "showers": inner = cloud(-3) + '<path d="M12 26l-1.5 4M17 26l-1.5 4M22 26l-1.5 4" stroke="#38BDF8"/>'; break;
      case "snow": inner = cloud(-3) + '<g fill="#E6ECF7" stroke="none"><circle cx="12" cy="28" r="1.3"/><circle cx="17" cy="29.5" r="1.3"/><circle cx="22" cy="28" r="1.3"/></g>'; break;
      case "storm": inner = cloud(-4) + '<path d="M17 20l-3.5 5.5h4L16 31l5.5-7h-4l2-4z" stroke="#F5B83D" fill="#F5B83D"/>'; break;
    }
    return `<svg class="wi" viewBox="0 0 32 32" fill="none" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
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
  const VIEWS = ["home", "map", "trip", "business", "alerts", "settings"];
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
  const T_STOPS = [[-20, [129, 140, 248]], [-5, [96, 165, 250]], [5, [56, 189, 248]], [15, [45, 212, 191]], [24, [250, 204, 21]], [32, [251, 146, 60]], [40, [239, 68, 68]]];
  function tempColor(v) {
    if (v == null || isNaN(v)) return "#8A97B3";
    if (v <= T_STOPS[0][0]) return "rgb(" + T_STOPS[0][1] + ")";
    for (let i = 1; i < T_STOPS.length; i++) {
      const [t1, c1] = T_STOPS[i];
      if (v <= t1) { const [t0, c0] = T_STOPS[i - 1], k = (v - t0) / (t1 - t0); return "rgb(" + c0.map((x, j) => Math.round(x + (c1[j] - x) * k)).join(",") + ")"; }
    }
    return "rgb(" + T_STOPS[T_STOPS.length - 1][1] + ")";
  }
  const tag = (k) => `<span class="tag tag-${k}">${t("tag_" + k)}</span>`;
  const hhmm = (d) => new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  // ---------- dünya şəhərləri ----------
  const WORLD = [
    ["Bakı", "Baku", "Баку", 40.4093, 49.8671], ["İstanbul", "Istanbul", "Стамбул", 41.0138, 28.9497], ["Dubay", "Dubai", "Дубай", 25.2048, 55.2708],
    ["London", "London", "Лондон", 51.5085, -0.1257], ["Nyu-York", "New York", "Нью-Йорк", 40.7143, -74.006], ["Tokio", "Tokyo", "Токио", 35.6895, 139.6917],
    ["Moskva", "Moscow", "Москва", 55.7522, 37.6156], ["Tbilisi", "Tbilisi", "Тбилиси", 41.6941, 44.8337], ["Paris", "Paris", "Париж", 48.8534, 2.3488],
    ["Qahirə", "Cairo", "Каир", 30.0626, 31.2497], ["Sinqapur", "Singapore", "Сингапур", 1.2897, 103.8501], ["Sidney", "Sydney", "Сидней", -33.8678, 151.2073]
  ];
  const cityName = (c) => c[S.lang === "en" ? 1 : S.lang === "ru" ? 2 : 0];
  async function loadWorld() {
    if (S.world && S.world.items.length && Date.now() - S.world.at < 15 * 60 * 1000) return;
    try {
      const url = "https://api.open-meteo.com/v1/forecast?latitude=" + WORLD.map((c) => c[3]).join(",") + "&longitude=" + WORLD.map((c) => c[4]).join(",") + "&current=temperature_2m,weather_code,is_day,wind_speed_10m&timezone=auto";
      let d = await fetchJSON(url);
      if (!Array.isArray(d)) d = [d];
      S.world = { at: Date.now(), items: d.map((x, i) => ({ c: WORLD[i], cur: x.current || {} })) };
    } catch (e) { S.world = { at: Date.now(), items: [], err: true }; }
    if (S.view === "home" || S.view === "map") render();
  }
  function worldStrip() {
    if (!S.world) return `<div class="world">${WORLD.slice(0, 8).map(() => '<div class="city skel"></div>').join("")}</div>`;
    if (!S.world.items.length) return `<p class="muted small">${t("err_network")}</p>`;
    return `<div class="world">${S.world.items.map((w, i) => `<button class="city" data-act="pick-world" data-i="${i}">
      <span class="city-n">${esc(cityName(w.c))}</span><span class="city-r">${wxIcon(w.cur.weather_code)}<b class="num" style="color:${tempColor(w.cur.temperature_2m)}">${round(w.cur.temperature_2m)}°</b></span></button>`).join("")}</div>`;
  }

  // ---------- radar (RainViewer, pulsuz, açarsız) ----------
  let radarMeta = null;
  async function getRadar() {
    if (DEMO) return null;
    if (radarMeta && Date.now() - radarMeta.at < 10 * 60 * 1000) return radarMeta;
    try {
      const j = await (await fetch("https://api.rainviewer.com/public/weather-maps.json")).json();
      const last = j.radar && j.radar.past && j.radar.past[j.radar.past.length - 1];
      radarMeta = last ? { at: Date.now(), url: j.host + last.path + "/256/{z}/{x}/{y}/4/1_1.png", time: last.time * 1000 } : null;
    } catch (e) { radarMeta = null; }
    return radarMeta;
  }
  function baseTiles(m) {
    if (DEMO) return;
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { maxZoom: 18, subdomains: "abcd", attribution: "© OpenStreetMap © CARTO" }).addTo(m);
  }
  const pin = (temp, label, me) => L.divIcon({ className: "", iconSize: null,
    html: `<div class="pin${me ? " me" : ""}"><i style="background:${tempColor(temp)}"></i><b class="num">${temp == null ? "–" : round(temp) + "°"}</b>${label ? `<span>${esc(label)}</span>` : ""}</div>` });

  // ---------- xəbərdarlıqların toplanması ----------
  function collectAlerts() {
    const out = [];
    const p = S.place;
    if (S.wx) dailyRisks(S.wx, S.wx.daily.time[0], S.wx.daily.time[2]).forEach((r) =>
      out.push({ kind: "skypulse", level: r.level, title: t("r_" + r.type) + (r.value == null ? "" : " · " + round(r.value, r.type === "wave" ? 1 : 0) + " " + r.unit), where: p.name, when: dayName(r.date) + " " + shortDate(r.date), src: "Open-Meteo" }));
    (S.savedWx || []).forEach((sw) => dailyRisks(sw.wx, sw.wx.daily.time[0], sw.wx.daily.time[2]).forEach((r) =>
      out.push({ kind: "skypulse", level: r.level, title: t("r_" + r.type) + (r.value == null ? "" : " · " + round(r.value, 0) + " " + r.unit), where: sw.name, when: dayName(r.date) + " " + shortDate(r.date), src: "Open-Meteo" })));
    (S.quakes || []).forEach((q) => out.push({ kind: "observed", level: q.mag >= 5 ? 3 : q.mag >= 4 ? 2 : 1, title: t("r_quake") + " M" + round(q.mag, 1), where: q.place, when: new Date(q.time).toLocaleString([], { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }), src: "USGS", url: q.url }));
    return out.sort((a, b) => b.level - a.level);
  }
  function alertRow(a) {
    return `<div class="alert l${a.level}"><span class="sev"></span><div class="a-main"><div class="a-top"><b>${esc(a.title)}</b>${tag(a.kind)}</div>
      <div class="a-meta">${esc(a.where || "")} · ${esc(a.when)} · ${a.url ? `<a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.src)}</a>` : esc(a.src)}</div></div><span class="lvl l${a.level}">${t("lvl" + a.level)}</span></div>`;
  }
  const officialRow = () => `<div class="alert l0"><span class="sev"></span><div class="a-main"><div class="a-top"><b>${t("official")}</b>${tag("official")}</div><div class="a-meta">${t("official_none_short")}</div></div></div>`;

  // ---------- 24 saat qrafiki ----------
  function timelineSvg(wx) {
    const nowKey = (wx.current && wx.current.time) ? wx.current.time.slice(0, 13) : "";
    let s = wx.hourly.time.findIndex((x) => x.slice(0, 13) >= nowKey); if (s < 0) s = 0;
    const N = 25, idx = Array.from({ length: N }, (_, k) => s + k).filter((i) => i < wx.hourly.time.length);
    const T = idx.map((i) => wx.hourly.temperature_2m[i]), P = idx.map((i) => wx.hourly.precipitation_probability[i] || 0);
    const W = 760, H = 190, padL = 34, padR = 12, top = 34, bot = 150;
    const lo = Math.floor(Math.min(...T)) - 1, hi = Math.ceil(Math.max(...T)) + 1;
    const x = (k) => padL + (k * (W - padL - padR)) / (idx.length - 1);
    const y = (v) => bot - ((v - lo) / (hi - lo || 1)) * (bot - top - 10);
    const line = T.map((v, k) => (k ? "L" : "M") + x(k).toFixed(1) + " " + y(v).toFixed(1)).join(" ");
    const area = line + ` L${x(idx.length - 1)} ${bot} L${x(0)} ${bot} Z`;
    const bw = (W - padL - padR) / idx.length * .55;
    const bars = P.map((p, k) => p > 0 ? `<rect x="${(x(k) - bw / 2).toFixed(1)}" y="${(bot - p * .45).toFixed(1)}" width="${bw.toFixed(1)}" height="${(p * .45).toFixed(1)}" rx="2" class="pbar"/>` : "").join("");
    const grid = [lo, Math.round((lo + hi) / 2), hi].map((v) => `<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}" class="gl"/><text x="${padL - 6}" y="${y(v) + 4}" class="axis" text-anchor="end">${v}°</text>`).join("");
    const ticks = idx.map((i, k) => k % 3 === 0 ? `<text x="${x(k)}" y="${H - 18}" class="axis" text-anchor="middle">${k === 0 ? t("now") : wx.hourly.time[i].slice(11, 16)}</text>
      <text x="${x(k)}" y="${y(T[k]) - 10}" class="tval" text-anchor="middle">${round(T[k])}°</text><circle cx="${x(k)}" cy="${y(T[k])}" r="${k === 0 ? 4.5 : 2.5}" class="${k === 0 ? "dotnow" : "dot"}"/>` : "").join("");
    return `<svg class="tl" viewBox="0 0 ${W} ${H}" role="img" aria-label="${t("next24")}"><defs><linearGradient id="ta" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".28"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
      ${grid}${bars}<path d="${area}" fill="url(#ta)"/><path d="${line}" class="tline"/>${ticks}
      <line x1="${x(0)}" x2="${x(0)}" y1="${top - 14}" y2="${bot}" class="nowline"/></svg>`;
  }

  // ---------- ƏSAS: İcmal ----------
  function viewHome() {
    const p = S.place, wx = S.wx, c = (wx && wx.current) || {};
    let loc;
    if (S.wxLoading && !wx) loc = `<div class="loc"><div class="loc-name">${esc(p.name)}</div><p class="muted"><span class="spin"></span> ${t("loading")}</p></div>`;
    else if (!wx) loc = `<div class="loc"><div class="loc-name">${esc(p.name)}</div><p class="muted">${esc(S.wxErr)}</p><button class="btn" data-act="reload">${t("retry")}</button></div>`;
    else loc = `<div class="loc">
        <div class="loc-h"><div><div class="loc-name">${esc(p.name)}</div><div class="loc-sub">${esc(placeLabel(p)) || "&nbsp;"}</div></div>${tag("forecast")}</div>
        <div class="loc-now"><span class="loc-ic">${wxIcon(c.weather_code)}</span><span class="loc-t num">${round(c.temperature_2m)}°</span>
          <div><div class="loc-c">${wcText(c.weather_code)}</div><div class="loc-sub">${t("feels")} <span class="num">${round(c.apparent_temperature)}°</span> · <span class="num">H ${round(wx.daily.temperature_2m_max[0])}° L ${round(wx.daily.temperature_2m_min[0])}°</span></div></div></div>
        <dl class="kv">
          <div><dt>${t("wind")}</dt><dd class="num">${round(c.wind_speed_10m)} <small>km/h</small></dd></div>
          <div><dt>${t("gusts")}</dt><dd class="num">${round(c.wind_gusts_10m)} <small>km/h</small></dd></div>
          <div><dt>${t("humidity")}</dt><dd class="num">${round(c.relative_humidity_2m)}<small>%</small></dd></div>
          <div><dt>${t("precip")}</dt><dd class="num">${round(c.precipitation, 1)} <small>mm</small></dd></div>
        </dl>
        <div class="loc-f"><span class="muted small">Open-Meteo · ${t("updated")} <span class="num">${S.wxTime ? hhmm(S.wxTime) : "–"}</span>${S.wxCached ? " · " + t("cached") : ""}</span>
          <span class="loc-act"><button class="icon-btn" data-act="save-place" title="${t("save_place")}" aria-label="${t("save_place")}">${navSvg("star")}</button><button class="icon-btn" data-act="geo" title="${t("my_location")}" aria-label="${t("my_location")}">${navSvg("locate")}</button><button class="btn primary sm" data-act="monitor-place">${t("monitor_this")}</button></span></div>
      </div>`;

    const alerts = collectAlerts();
    const counts = [1, 2, 3].map((l) => alerts.filter((a) => a.level === l).length);
    const alertsHtml = `<section class="panel alerts-col"><div class="panel-h"><h2>${t("active_alerts")}</h2><button class="link-btn small" data-nav="alerts">${t("view_all")}</button></div>
      <div class="sevbar"><span class="s3"><b class="num">${counts[2]}</b>${t("lvl3")}</span><span class="s2"><b class="num">${counts[1]}</b>${t("lvl2")}</span><span class="s1"><b class="num">${counts[0]}</b>${t("lvl1")}</span></div>
      <div class="alerts">${officialRow()}${alerts.slice(0, 6).map(alertRow).join("") || `<div class="empty">${t("risk_none")}</div>`}</div>
      <p class="note">${t("risk_note")}</p></section>`;

    // səfər
    const tr = S.trip, res = S.tripRes;
    let trip;
    if (res && tr && tr.to) {
      const all = res.pts.flatMap((x) => x.risks), worst = all.reduce((m, r) => Math.max(m, r.level), 0);
      trip = `<div class="route"><span>${esc(tr.from.name)}</span><i></i><span>${esc(tr.to.name)}</span></div>
        <div class="kv3"><div><dt>${t("mode")}</dt><dd>${t("m_" + tr.mode)}</dd></div><div><dt>${t("depart")}</dt><dd class="num">${esc(tr.depart.replace("T", " "))}</dd></div><div><dt>${t("trip_dist")}</dt><dd class="num">${round(res.dist)} km</dd></div></div>
        <div class="trip-risk l${worst}">${worst ? `<span class="lvl l${worst}">${t("lvl" + worst)}</span> ${all.length} ${t("risks_on_route")}` : t("risk_none_short")}</div>`;
    } else trip = `<p class="muted small">${t("trip_none")}</p>`;
    // biznes
    let biz = `<div class="skel"></div>`;
    if (wx) {
      const rs = dailyRisks(wx, wx.daily.time[0], wx.daily.time[2]);
      const seen = new Set(), msgs = rs.filter((r) => { const k = I18N[S.lang]["b_" + S.sector + "_" + r.type]; if (!k || seen.has(r.type)) return false; seen.add(r.type); return true; }).slice(0, 2);
      biz = `<div class="biz-h"><span class="pill">${t("s_" + S.sector)}</span><span class="muted small">${esc(p.name)}</span></div>` +
        (msgs.length ? msgs.map((r) => `<div class="biz-i l${r.level}"><b>${t("r_" + r.type)}</b> · ${esc(I18N[S.lang]["b_" + S.sector + "_" + r.type])}</div>`).join("") : `<p class="muted small">${t("biz_none")}</p>`);
    }
    // telegram
    const mons = Object.values(S.monStatus), act = mons.filter((m) => m.status === "active");
    const next = act.map((m) => m.next_due).filter(Boolean).sort()[0];
    const tg = `<div class="tg-row"><span class="tg-dot ${act.length ? "on" : ""}"></span><div><b>${act.length ? t("tg_linked") : t("tg_not_linked")}</b>
      <div class="muted small">${act.length ? act.length + " " + t("monitors_active") + (next ? " · " + t("next_update") + " <span class='num'>" + hhmm(next * 1000) + "</span>" : "") : t("tg_hint")}</div></div></div>`;

    return `${S.wxCached ? `<div class="banner">${t("offline")}</div>` : ""}
    <div class="ov">
      <section class="ov-map panel flush"><div id="miniMap"></div>${wx ? loc : loc}
        <div class="map-ctl">${["radar", "cities", "quakes"].map((k) => `<button type="button" class="ltog" data-layer="${k}" aria-pressed="${!!S.layers[k]}">${t("lay_" + k)}</button>`).join("")}</div>
        <div class="map-legend"><span class="tscale"><i></i><em class="num">-20°</em><em class="num">0°</em><em class="num">20°</em><em class="num">40°</em></span></div>
      </section>
      ${alertsHtml}
      <section class="panel ov-tl"><div class="panel-h"><h2>${t("next24")}</h2><span class="legend-inline"><span><i class="lk-t"></i>${t("temp_label")}</span><span><i class="lk-p"></i>${t("precip_prob")}</span>${tag("forecast")}</span></div>
        ${wx ? `<div class="tl-wrap">${timelineSvg(wx)}</div>` : '<div class="skel" style="height:150px"></div>'}
        ${wx ? `<div class="days">${wx.daily.time.slice(0, 7).map((d, i) => `<div class="day"><span class="d">${i === 0 ? t("today") : dayName(d)}</span>${wxIcon(wx.daily.weather_code[i])}<span class="num"><b>${round(wx.daily.temperature_2m_max[i])}°</b> <em>${round(wx.daily.temperature_2m_min[i])}°</em></span><span class="num pr">${wx.daily.precipitation_sum[i] > 0 ? round(wx.daily.precipitation_sum[i], 1) + " mm" : "—"}</span></div>`).join("")}</div>` : ""}
      </section>
      <section class="panel ov-trip"><div class="panel-h"><h2>${t("trip_monitor")}</h2><button class="link-btn small" data-nav="trip">${t("open")}</button></div>${trip}</section>
      <section class="panel ov-biz"><div class="panel-h"><h2>${t("biz_preview")}</h2><button class="link-btn small" data-nav="business">${t("open")}</button></div>${biz}</section>
      <section class="panel ov-tg"><div class="panel-h"><h2>${t("tg_status")}</h2><button class="link-btn small" data-nav="settings">${t("my_monitors")}</button></div>${tg}</section>
      <section class="panel ov-world"><div class="panel-h"><h2>${t("world")}</h2>${tag("forecast")}</div>${worldStrip()}</section>
    </div>${promosHtml()}`;
  }

  // ---------- Xəbərdarlıqlar ----------
  async function loadSavedWx() {
    const list = [];
    for (const s of S.saved.slice(0, 8)) { try { list.push({ name: s.name, wx: await getWeather(s.lat, s.lon) }); } catch (e) { /* keç */ } }
    S.savedWx = list; if (S.view === "alerts" || S.view === "home") render();
  }
  function viewAlerts() {
    const f = S.alertFilter || "all";
    const all = collectAlerts();
    const list = all.filter((a) => f === "all" || a.kind === f);
    const fb = (k) => `<button type="button" data-afilter="${k}" aria-pressed="${f === k}">${k === "all" ? t("all") : t("tag_" + k)}</button>`;
    return `<div class="stack"><section class="panel"><div class="panel-h"><h2>${t("alerts_title")}</h2><span class="muted small">${esc(S.place.name)}${S.saved.length ? " + " + S.saved.length + " " + t("saved").toLowerCase() : ""}</span></div>
      <div class="seg">${fb("all")}${fb("official")}${fb("skypulse")}${fb("observed")}</div></section>
      <section class="panel"><div class="alerts">${f === "all" || f === "official" ? officialRow() : ""}${list.map(alertRow).join("") || `<div class="empty">${t("no_alerts")}</div>`}</div>
      <div class="legend-def"><div>${tag("official")} ${t("def_official")}</div><div>${tag("skypulse")} ${t("def_skypulse")}</div><div>${tag("observed")} ${t("def_observed")}</div><div>${tag("forecast")} ${t("def_forecast")}</div></div></section></div>`;
  }

  // ---------- Canlı xəritə ----------
  let map = null, mapLayer = null, miniMap = null;
  function viewMap() {
    const yrs = [5, 10, 20].map((y) => `<option value="${y}" ${S.histYears === y ? "selected" : ""}>${y} ${t("years")}</option>`).join("");
    let hist = "";
    if (S.histLoading) hist = `<p><span class="spin"></span> ${t("loading")}</p>`;
    else if (S.histErr) hist = `<p class="muted">${esc(S.histErr)}</p>`;
    else if (S.hist) hist = `<p><b class="num">${S.hist.count}</b> ${t("hist_count")}</p><div class="list">${S.hist.items.slice(0, 10).map((q) => `<div class="row"><span class="mag" style="--mc:${q.mag >= 6 ? "var(--r)" : "var(--o)"}">${round(q.mag, 1)}</span><div class="main grow"><span class="small">${esc(q.place)}</span><div class="small muted num">${new Date(q.time).toLocaleDateString()}</div></div><a class="small" href="${esc(q.url)}" target="_blank" rel="noopener">USGS</a></div>`).join("")}</div>`;
    return `<div class="stack"><section class="panel flush map-full"><div id="map"></div>
        <div class="map-ctl">${["radar", "cities", "quakes"].map((k) => `<button type="button" class="ltog" data-layer="${k}" aria-pressed="${!!S.layers[k]}">${t("lay_" + k)}</button>`).join("")}</div>
        <div class="map-legend"><span class="tscale"><i></i><em class="num">-20°</em><em class="num">0°</em><em class="num">20°</em><em class="num">40°</em></span>
          <span class="lg"><i class="dot" style="background:var(--o)"></i>${t("lg_quake")}</span><span class="lg"><i class="dot" style="background:#A78BFA"></i>${t("lg_hist")}</span></div>
      </section>
      <p class="note">${t("radar_note")}${radarMeta ? " · " + hhmm(radarMeta.time) : ""} · ${t("footer_sources")}</p>
      <section class="panel"><div class="panel-h"><h2>${t("history")}</h2>${tag("observed")}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><div class="field" style="flex:0 0 140px"><select id="histYears">${yrs}</select></div><button class="btn primary" data-act="hist">${t("show")}</button></div>
        ${hist}<p class="note">${t("hist_note")}</p></section></div>`;
  }
  function addLayers(m, layer, full) {
    const p = S.place, c = S.wx && S.wx.current;
    if (S.layers.radar) getRadar().then((r) => { if (r) L.tileLayer(r.url, { opacity: .7, maxNativeZoom: 7, maxZoom: 18, attribution: "RainViewer" }).addTo(layer); });
    if (S.layers.cities) (S.world ? S.world.items : []).forEach((w) => L.marker([w.c[3], w.c[4]], { icon: pin(w.cur.temperature_2m, cityName(w.c)) }).addTo(layer));
    if (S.layers.quakes) (S.quakes || []).forEach((q) => L.circleMarker([q.lat, q.lon], { radius: 3 + q.mag * 2, color: "#F97316", weight: 1.5, fillColor: "#F97316", fillOpacity: .35 })
      .bindPopup(`M${round(q.mag, 1)} · ${esc(q.place)}<br>${new Date(q.time).toLocaleString()}<br><a href="${esc(q.url)}" target="_blank" rel="noopener">USGS</a>`).addTo(layer));
    if (full && S.hist) S.hist.items.forEach((q) => L.circleMarker([q.lat, q.lon], { radius: 3 + q.mag * 1.6, color: "#A78BFA", weight: 1, fillColor: "#A78BFA", fillOpacity: .3 })
      .bindPopup(`M${round(q.mag, 1)} · ${esc(q.place)}<br>${new Date(q.time).toLocaleDateString()}`).addTo(layer));
    S.saved.forEach((s) => L.circleMarker([s.lat, s.lon], { radius: 5, color: "#E6ECF7", weight: 2, fillColor: "#38BDF8", fillOpacity: 1 }).bindPopup(esc(s.name)).addTo(layer));
    if (S.tripRes && S.trip && S.trip.to) {
      const a = [S.trip.from.lat, S.trip.from.lon], b = [S.trip.to.lat, S.trip.to.lon];
      L.polyline([a, b], { color: "#38BDF8", weight: 2, dashArray: "6 6", opacity: .9 }).bindPopup(t("trip_not_route")).addTo(layer);
    }
    if (S.rules) L.circle([p.lat, p.lon], { radius: S.rules.quake_radius_km * 1000, color: "#38BDF8", weight: 1, opacity: .5, fill: false, dashArray: "3 6" }).addTo(layer);
    addLive(m);
    L.marker([p.lat, p.lon], { icon: pin(c && c.temperature_2m, p.name, true), zIndexOffset: 1000 })
      .bindPopup(`<b>${esc(p.name)}</b>${c ? `<br>${round(c.temperature_2m)}° · ${wcText(c.weather_code)}<br>${t("gusts")}: ${round(c.wind_gusts_10m)} km/h` : ""}`).addTo(layer);
  }
  function mountMap() {
    const el = document.getElementById("map");
    if (!el) return;
    if (typeof L === "undefined") { el.innerHTML = `<p class="info">${t("err_network")}</p>`; return; }
    if (map) { map.remove(); map = null; }
    map = L.map("map", { worldCopyJump: true, zoomControl: false }).setView([S.place.lat, S.place.lon], 4);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    baseTiles(map); mapLayer = L.layerGroup().addTo(map); addLayers(map, mapLayer, true);
  }
  function mountMiniMap() {
    const el = document.getElementById("miniMap");
    if (!el || typeof L === "undefined") return;
    if (miniMap) { miniMap.remove(); miniMap = null; }
    const mobile = window.innerWidth < 900;
    miniMap = L.map("miniMap", { zoomControl: false, scrollWheelZoom: false, worldCopyJump: true }).setView([S.place.lat + (mobile ? 0 : 6), S.place.lon - (mobile ? 0 : 14)], mobile ? 3 : 4);
    L.control.zoom({ position: "bottomright" }).addTo(miniMap);
    baseTiles(miniMap); addLayers(miniMap, L.layerGroup().addTo(miniMap), false);
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
  const HAZ = ["gust", "precip", "snow", "heat", "cold", "visibility", "thunder", "wave"];
  function defaultTrip() {
    const d = new Date(Date.now() + 3600e3); d.setMinutes(0, 0, 0);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
    return { from: Object.assign({}, S.place), to: null, depart: local, arrive: "", mode: "road", hazards: HAZ.filter((h) => h !== "wave") };
  }
  const LEVEL_COLOR = ["#38BDF8", "#F5B83D", "#F97316", "#EF4444"];
  function hourRisk(h, i) {
    const R = S.rules, out = [];
    const add = (type, level, value, unit) => { if (level > 0) out.push({ type, level, value, unit }); };
    add("gust", levelUp(h.wind_gusts_10m[i], R.gust_kmh), h.wind_gusts_10m[i], "km/h");
    add("precip", levelUp(h.precipitation[i], [2, 5, 10]), h.precipitation[i], "mm/h");
    add("heat", levelUp(h.temperature_2m[i], R.heat_c), h.temperature_2m[i], "°C");
    add("cold", levelDown(h.temperature_2m[i], R.cold_c), h.temperature_2m[i], "°C");
    if (h.visibility) add("visibility", levelDown(h.visibility[i], R.visibility_m), h.visibility[i], "m");
    const code = h.weather_code[i];
    if (R.thunder_codes.includes(code)) add("thunder", R.thunder_level, null, "");
    if ([71, 73, 75, 77, 85, 86].includes(code)) add("snow", [75, 86].includes(code) ? 2 : 1, null, "");
    return out;
  }
  function stopLive() { if (S.liveWatch != null && navigator.geolocation) navigator.geolocation.clearWatch(S.liveWatch); S.liveWatch = null; S.liveOn = false; }
  function startLive(setOrigin) {
    if (!navigator.geolocation) { toast(t("err_geo")); return; }
    stopLive(); S.liveOn = true;
    S.liveWatch = navigator.geolocation.watchPosition((pos) => {
      const first = !S.live;
      S.live = { lat: +pos.coords.latitude.toFixed(5), lon: +pos.coords.longitude.toFixed(5), acc: Math.round(pos.coords.accuracy), at: Date.now(), speed: pos.coords.speed };
      if (setOrigin && first && S.trip) { S.trip.from = { name: t("live_pos"), lat: S.live.lat, lon: S.live.lon }; store.set("trip", S.trip); if (S.view === "trip") render(); }
      updateLiveMarkers();
    }, () => { toast(t("err_geo")); stopLive(); if (S.view === "trip") render(); }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
    if (S.view === "trip") render();
  }
  const liveMarkers = [];
  function liveIcon() { return L.divIcon({ className: "", iconSize: null, html: '<div class="live-dot"><i></i></div>' }); }
  function updateLiveMarkers() {
    if (typeof L === "undefined" || !S.live) return;
    liveMarkers.forEach((m) => { try { m.setLatLng([S.live.lat, S.live.lon]); } catch (e) { /* xəritə bağlanıb */ } });
    const el = document.getElementById("liveInfo");
    if (el) el.innerHTML = liveInfoHtml();
  }
  function addLive(m) {
    if (!S.live || typeof L === "undefined") return;
    const mk = L.marker([S.live.lat, S.live.lon], { icon: liveIcon(), zIndexOffset: 2000 }).bindPopup(t("live_pos")).addTo(m);
    liveMarkers.push(mk);
  }
  const liveInfoHtml = () => S.live ? `<span class="live-badge"><i></i>${t("live_on")}</span> <span class="num small">${S.live.lat}, ${S.live.lon} · ±${S.live.acc} m · ${hhmm(S.live.at)}</span>` : "";

  function viewTrip() {
    if (!S.trip) S.trip = defaultTrip();
    const tr = S.trip;
    const modes = ["road", "air", "sea"].map((m) => `<button type="button" data-mode="${m}" aria-pressed="${tr.mode === m}">${t("m_" + m)}</button>`).join("");
    const hz = HAZ.map((h) => `<label><input type="checkbox" data-haz="${h}" ${tr.hazards.includes(h) ? "checked" : ""}> ${t("r_" + h)}</label>`).join("");
    let res = "";
    if (S.tripLoading) res = `<section class="panel"><span class="spin"></span> ${t("loading")}</section>`;
    else if (S.tripErr) res = `<section class="panel"><p>${esc(S.tripErr)}</p></section>`;
    else if (S.tripRes) res = tripResultHtml(S.tripRes);
    return `<div class="stack"><section class="panel"><div class="panel-h"><h2>${t("trip_title")}</h2><span id="liveInfo">${liveInfoHtml()}</span></div>
      <form class="form cols" id="tripForm" autocomplete="off">
        <div class="field"><label for="tFrom">${t("from")}</label><div class="inrow"><input id="tFrom" value="${esc(tr.from ? tr.from.name : "")}" placeholder="${t("search_ph")}"><button type="button" class="btn sm ${S.liveOn ? "primary" : ""}" data-act="live-origin">${S.liveOn ? t("live_stop") : t("live_use")}</button></div><div class="results" id="tFromRes" hidden></div></div>
        <div class="field"><label for="tTo">${t("to")}</label><input id="tTo" value="${esc(tr.to ? tr.to.name : "")}" placeholder="${t("search_ph")}"><div class="results" id="tToRes" hidden></div></div>
        <div class="field"><label for="tDep">${t("depart")}</label><input id="tDep" type="datetime-local" value="${esc(tr.depart)}" required></div>
        <div class="field"><span class="label">${t("mode")}</span><div class="seg">${modes}</div></div>
        <div class="field" style="grid-column:1/-1"><span class="label">${t("hazards")}</span><div class="checks">${hz}</div></div>
        <div style="grid-column:1/-1"><button class="btn primary" type="submit">${t("analyze")}</button></div>
      </form></section>${res}
      <p class="note">${t("trip_limits2")}</p></div>`;
  }
  function haversine(a, b) {
    const R = 6371, toR = (x) => x * Math.PI / 180;
    const dLat = toR(b.lat - a.lat), dLon = toR(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  async function osrmRoute(a, b) {
    if (DEMO) return null;
    const j = await fetchJSON("https://router.project-osrm.org/route/v1/driving/" + a.lon + "," + a.lat + ";" + b.lon + "," + b.lat + "?overview=full&geometries=geojson", 20000);
    const r = j.routes && j.routes[0];
    return r ? { coords: r.geometry.coordinates.map((c) => [c[1], c[0]]), dist: r.distance / 1000, dur: r.duration / 3600 } : null;
  }
  function pointAt(coords, frac) {
    if (frac <= 0) return { lat: coords[0][0], lon: coords[0][1] };
    let total = 0; const seg = [];
    for (let i = 1; i < coords.length; i++) { const d = haversine({ lat: coords[i - 1][0], lon: coords[i - 1][1] }, { lat: coords[i][0], lon: coords[i][1] }); seg.push(d); total += d; }
    let target = total * frac;
    for (let i = 0; i < seg.length; i++) {
      if (target <= seg[i]) { const k = seg[i] ? target / seg[i] : 0; return { lat: coords[i][0] + (coords[i + 1][0] - coords[i][0]) * k, lon: coords[i][1] + (coords[i + 1][1] - coords[i][1]) * k, idx: i }; }
      target -= seg[i];
    }
    const l = coords[coords.length - 1]; return { lat: l[0], lon: l[1], idx: coords.length - 2 };
  }
  async function analyzeTrip() {
    const tr = S.trip;
    if (!tr.from || !tr.to || tr.from.lat == null || tr.to.lat == null) { S.tripErr = t("choose_place"); render(); return; }
    S.tripLoading = true; S.tripErr = null; S.tripRes = null; render();
    try {
      let route = null, routed = false;
      if (tr.mode === "road") { try { route = await osrmRoute(tr.from, tr.to); routed = !!route; } catch (e) { route = null; } }
      const straight = haversine(tr.from, tr.to);
      if (!route) {
        const speed = tr.mode === "air" ? 750 : tr.mode === "sea" ? 30 : 60;
        route = { coords: Array.from({ length: 21 }, (_, k) => [tr.from.lat + (tr.to.lat - tr.from.lat) * k / 20, tr.from.lon + (tr.to.lon - tr.from.lon) * k / 20]), dist: straight, dur: straight / speed + (tr.mode === "air" ? 0.5 : 0), est: true };
      }
      const n = route.dist > 600 ? 8 : route.dist > 150 ? 6 : 4;
      const dep = new Date(tr.depart);
      const pts = Array.from({ length: n + 1 }, (_, k) => {
        const f = k / n, p = pointAt(route.coords, f);
        const eta = new Date(dep.getTime() + f * route.dur * 3600e3);
        return { f, lat: +p.lat.toFixed(4), lon: +p.lon.toFixed(4), idx: p.idx || 0, km: route.dist * f, eta };
      });
      const url = "https://api.open-meteo.com/v1/forecast?latitude=" + pts.map((p) => p.lat).join(",") + "&longitude=" + pts.map((p) => p.lon).join(",") +
        "&hourly=temperature_2m,precipitation,weather_code,wind_gusts_10m,visibility&timezone=auto&forecast_days=16";
      let wxs = await fetchJSON(url, 20000); if (!Array.isArray(wxs)) wxs = [wxs];
      let marine = [];
      if (tr.mode === "sea") marine = await Promise.all(pts.map((p) => getMarine(p.lat, p.lon).catch(() => null)));
      pts.forEach((p, k) => {
        const h = wxs[k] && wxs[k].hourly;
        p.wx = null; p.risks = [];
        if (!h) return;
        const key = new Date(p.eta.getTime() - p.eta.getTimezoneOffset() * 6e4).toISOString().slice(0, 13);
        let i = h.time.findIndex((x) => x.slice(0, 13) === key);
        if (i < 0) { p.beyond = true; return; }
        p.wx = { temp: h.temperature_2m[i], gust: h.wind_gusts_10m[i], precip: h.precipitation[i], code: h.weather_code[i], vis: h.visibility ? h.visibility[i] : null };
        p.risks = hourRisk(h, i).filter((r) => tr.hazards.includes(r.type));
        if (marine[k] && marine[k].daily) {
          const di = marine[k].daily.time.indexOf(key.slice(0, 10));
          const wv = di >= 0 ? marine[k].daily.wave_height_max[di] : null;
          p.wave = wv; const lv = levelUp(wv, S.rules.wave_m);
          if (lv && tr.hazards.includes("wave")) p.risks.push({ type: "wave", level: lv, value: wv, unit: "m" });
        }
        p.level = p.risks.reduce((m, r) => Math.max(m, r.level), 0);
      });
      S.tripRes = { pts, route, routed, dist: route.dist, dur: route.dur, mode: tr.mode, dep };
      store.set("trip", S.trip);
    } catch (e) { S.tripErr = t("err_network"); }
    S.tripLoading = false; render();
  }
  const fmtDur = (h) => { const m = Math.round(h * 60); return Math.floor(m / 60) + " " + t("h_short") + " " + (m % 60) + " " + t("min_short"); };
  function tripResultHtml(res) {
    const worst = res.pts.reduce((m, p) => Math.max(m, p.level || 0), 0);
    const arr = new Date(res.dep.getTime() + res.dur * 3600e3);
    const rows = res.pts.map((p, k) => `<tr class="l${p.level || 0}"><td><span class="sev-dot" style="background:${LEVEL_COLOR[p.level || 0]}"></span></td>
      <td class="num">${k === 0 ? t("trip_origin") : k === res.pts.length - 1 ? t("trip_dest") : round(p.km) + " km"}</td>
      <td class="num">${p.eta.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}</td>
      <td>${p.wx ? wxIcon(p.wx.code) : ""}</td><td class="num">${p.wx ? round(p.wx.temp) + "°" : "—"}</td><td class="num">${p.wx ? round(p.wx.gust) : "—"}</td><td class="num">${p.wx ? round(p.wx.precip, 1) : "—"}</td>
      ${res.mode === "sea" ? `<td class="num">${p.wave != null ? round(p.wave, 1) : "—"}</td>` : ""}
      <td>${p.beyond ? `<span class="muted small">${t("beyond_short")}</span>` : p.risks.length ? p.risks.map((r) => `<span class="lvl l${r.level}">${t("r_" + r.type)}</span>`).join(" ") : `<span class="muted small">${t("ok_short")}</span>`}</td></tr>`).join("");
    return `<section class="panel"><div class="trip-sum">
        <div><dt>${res.routed ? t("distance") : t("trip_dist")}</dt><dd class="num">${round(res.dist)} km</dd></div>
        <div><dt>${t("duration")}</dt><dd class="num">${fmtDur(res.dur)}</dd></div>
        <div><dt>${t("eta")}</dt><dd class="num">${arr.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}</dd></div>
        <div><dt>${t("route_risk")}</dt><dd><span class="lvl l${worst}">${worst ? t("lvl" + worst) : t("ok_short")}</span></dd></div></div>
      <p class="note">${res.routed ? t("route_osrm") : t("route_est")} ${tag("forecast")} ${tag("skypulse")}</p>
      <div id="tripMap"></div>
      <div class="tbl-wrap"><table class="route-tbl"><thead><tr><th></th><th>${t("section")}</th><th>${t("eta")}</th><th></th><th>°C</th><th>${t("gusts")} km/h</th><th>mm/h</th>${res.mode === "sea" ? `<th>${t("waves")} m</th>` : ""}<th>${t("risks")}</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="row-btns"><button class="btn primary" data-act="monitor-trip">${t("monitor_trip")}</button><button class="btn" data-act="live-origin">${S.liveOn ? t("live_stop") : t("live_follow")}</button></div></section>`;
  }
  let tripMap = null;
  function mountTripMap() {
    const el = document.getElementById("tripMap");
    if (!el || typeof L === "undefined" || !S.tripRes) return;
    if (tripMap) { tripMap.remove(); tripMap = null; }
    const res = S.tripRes;
    tripMap = L.map("tripMap", { zoomControl: false, scrollWheelZoom: false });
    L.control.zoom({ position: "bottomright" }).addTo(tripMap);
    baseTiles(tripMap);
    // marşrutu hissələrə bölüb risk rəngi ilə çək
    for (let k = 1; k < res.pts.length; k++) {
      const a = res.pts[k - 1], b = res.pts[k];
      const seg = res.route.coords.slice(a.idx, (b.idx || res.route.coords.length - 2) + 2);
      const lvl = Math.max(a.level || 0, b.level || 0);
      L.polyline(seg.length > 1 ? seg : [[a.lat, a.lon], [b.lat, b.lon]], { color: LEVEL_COLOR[lvl], weight: 5, opacity: .95, dashArray: res.routed ? null : "8 8" }).addTo(tripMap);
    }
    res.pts.forEach((p, k) => L.circleMarker([p.lat, p.lon], { radius: k === 0 || k === res.pts.length - 1 ? 7 : 4, color: "#0B1222", weight: 2, fillColor: LEVEL_COLOR[p.level || 0], fillOpacity: 1 })
      .bindPopup(`<b>${k === 0 ? t("trip_origin") : k === res.pts.length - 1 ? t("trip_dest") : round(p.km) + " km"}</b><br>${p.eta.toLocaleString()}${p.wx ? `<br>${round(p.wx.temp)}° · ${t("gusts")} ${round(p.wx.gust)} km/h · ${round(p.wx.precip, 1)} mm` : ""}`).addTo(tripMap));
    addLive(tripMap);
    tripMap.fitBounds(L.latLngBounds(res.route.coords), { padding: [24, 24] });
  }

  // ----- biznes -----
  function sectorIndex(sector, d, i) {
    const g = d.wind_gusts_10m_max[i], pr = d.precipitation_sum[i], tx = d.temperature_2m_max[i], tn = d.temperature_2m_min[i], code = d.weather_code[i];
    const storm = S.rules.thunder_codes.includes(code);
    if (sector === "restaurant") { // açıq oturacaq yararlılığı
      if (g >= 50 || pr >= 5 || storm || tx < 8 || tx > 38) return 2;
      if (g >= 30 || pr >= 1 || tx < 15 || tx > 32) return 1; return 0;
    }
    if (sector === "construction") { // açıq iş / kran pəncərəsi
      if (g >= 50 || storm || pr >= 10 || tn <= -5) return 2;
      if (g >= 35 || pr >= 3 || tn <= 0 || tx >= 35) return 1; return 0;
    }
    if (g >= 70 || storm || d.snowfall_sum[i] >= 5 || pr >= 30) return 2; // logistika: yol şəraiti
    if (g >= 50 || pr >= 10 || d.snowfall_sum[i] > 0 || tn <= 0) return 1; return 0;
  }
  function viewBusiness() {
    const sectors = ["restaurant", "construction", "logistics"].map((s) => `<button type="button" data-sector="${s}" aria-pressed="${S.sector === s}">${t("s_" + s)}</button>`).join("");
    let body = `<div class="skel" style="height:200px"></div>`, hero = "";
    const wx = S.wx;
    if (wx) {
      const d = wx.daily, n = Math.min(7, d.time.length);
      const idxLbl = (v) => t("bi_" + S.sector + "_" + v);
      const ti = Math.min(1, n - 1);
      const tv = sectorIndex(S.sector, d, ti);
      const trs = dailyRisks(wx, d.time[ti], d.time[ti]);
      hero = `<section class="panel biz-hero b${tv}"><div class="bh-l"><span class="eyebrow">${t("tomorrow")} · ${dayName(d.time[ti])} ${shortDate(d.time[ti])}</span>
          <div class="bh-v"><span class="bh-dot"></span>${idxLbl(tv)}</div>
          <div class="muted small">${t("bi_q_" + S.sector)}</div></div>
        <div class="bh-r">${wxIcon(d.weather_code[ti])}<div class="num"><b>${round(d.temperature_2m_max[ti])}°</b> / ${round(d.temperature_2m_min[ti])}°</div>
          <div class="num small">${t("gusts")} ${round(d.wind_gusts_10m_max[ti])} km/h · ${round(d.precipitation_sum[ti], 1)} mm</div></div>
        ${trs.length ? `<div class="bh-msgs">${trs.map((r) => I18N[S.lang]["b_" + S.sector + "_" + r.type] ? `<div class="biz-i l${r.level}"><b>${t("r_" + r.type)}</b> · ${esc(I18N[S.lang]["b_" + S.sector + "_" + r.type])}</div>` : "").join("")}</div>` : ""}</section>`;
      const rows = Array.from({ length: n }, (_, i) => {
        const v = sectorIndex(S.sector, d, i), rs = dailyRisks(wx, d.time[i], d.time[i]);
        const msg = rs.map((r) => I18N[S.lang]["b_" + S.sector + "_" + r.type]).filter(Boolean)[0];
        return `<tr><td><b>${i === 0 ? t("today") : i === 1 ? t("tomorrow") : dayName(d.time[i])}</b> <span class="muted small num">${shortDate(d.time[i])}</span></td>
          <td>${wxIcon(d.weather_code[i])}</td><td class="num"><b>${round(d.temperature_2m_max[i])}°</b> <span class="muted">${round(d.temperature_2m_min[i])}°</span></td>
          <td class="num"><span class="gbar"><i style="width:${Math.min(100, d.wind_gusts_10m_max[i])}%;background:${d.wind_gusts_10m_max[i] >= 50 ? "var(--o)" : "var(--accent)"}"></i></span>${round(d.wind_gusts_10m_max[i])}</td>
          <td class="num">${round(d.precipitation_sum[i], 1)}</td>
          <td><span class="bidx b${v}">${idxLbl(v)}</span>${msg ? `<div class="small muted">${esc(msg)}</div>` : ""}</td></tr>`;
      }).join("");
      body = `<div class="tbl-wrap"><table class="biz-tbl"><thead><tr><th>${t("day")}</th><th></th><th>°C</th><th>${t("gusts")} km/h</th><th>mm</th><th>${t("bi_col_" + S.sector)}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    } else if (S.wxErr) body = `<p>${esc(S.wxErr)}</p>`;
    return `<div class="stack"><section class="panel"><div class="panel-h"><h2>${t("biz_title")}</h2>
        <span class="loc-pick"><span class="muted small">${t("biz_for")}:</span> <b>${esc(S.place.name)}</b> <button class="btn sm" data-act="geo">${t("my_location")}</button></span></div>
      <div class="seg">${sectors}</div></section>
      ${hero}
      <section class="panel"><div class="panel-h"><h2>${t("week_impact")}</h2>${tag("forecast")}${tag("skypulse")}</div>${body}<p class="note">${t("biz_note")}</p></section></div>`;
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
    const sl = document.getElementById("stLive"), st = document.getElementById("stTg");
    if (sl) { sl.className = "stat" + (S.wx && !S.wxCached && !DEMO ? "" : " off"); sl.innerHTML = "<i></i>" + (DEMO ? "DEMO · " + t("tag_forecast") : (S.wxCached ? t("cached") : "LIVE · Open-Meteo" + (S.wxTime ? " " + hhmm(S.wxTime) : ""))); }
    if (st) { const n = Object.values(S.monStatus).filter((m) => m.status === "active").length; st.className = "stat" + (n ? "" : " off"); st.innerHTML = "<i></i>Telegram" + (n ? " · " + n : ""); }
    const v = S.view;
    const demoBar = DEMO ? `<div class="banner"><b>DEMO</b> · ${t("demo_banner")}</div>` : "";
    const html = demoBar + (v === "home" ? viewHome() : v === "map" ? viewMap() : v === "trip" ? viewTrip() : v === "business" ? viewBusiness() : v === "alerts" ? viewAlerts() : viewSettings());
    const keepFocus = document.activeElement && document.activeElement.id;
    if (v !== "map" || !document.getElementById("map")) { $("#view").innerHTML = html; if (v === "map") mountMap(); }
    else { $("#view").innerHTML = html; mountMap(); }
    if (v === "home") { if (miniMap) { miniMap.remove(); miniMap = null; } mountMiniMap(); }
    liveMarkers.length = 0;
    if (v === "trip") { bindTripSearch(); mountTripMap(); }
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
    const af = e.target.closest("[data-afilter]");
    if (af) { S.alertFilter = af.dataset.afilter; render(); return; }
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
    loadSavedWx();
    refreshMonitors(true);
    setInterval(() => refreshMonitors(true), 30000);
    window.addEventListener("online", () => loadPlace());
    if ("serviceWorker" in navigator && HAS_SERVER) navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  // Test üçün ixrac (brauzerdə istifadə olunmur)
  window.__skypulse = { dailyRisks, levelUp, levelDown, S };
  init();
})();
