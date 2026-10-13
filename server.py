"""
SkyPulse server — bir fayl, əlavə paket lazım deyil (yalnız Python 3.9+).

Nə edir:
  1. Saytı açır:            http://localhost:8000
  2. Kiçik API:             /api/health, /api/monitors, /api/run-checks
  3. Telegram botu:         /start <kod> ilə qoşulma, /now, /list, /stop, "Dayandır" düyməsi
  4. Planlı yoxlama:        hər dəqiqə vaxtı çatan monitorinqləri yoxlayır (və ya n8n çağırır)
  5. Təkrarın qarşısı:      göndərilən hər xəbərdarlıq SQLite-da yadda saxlanır

İşə salmaq:  python server.py
Tokeni .env faylında saxlayın (.env.example-a baxın). Token heç vaxt brauzerə göndərilmir.
"""
import html
import json
import math
import os
import secrets
import sqlite3
import sys
import threading
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

BASE = os.path.dirname(os.path.abspath(__file__))


# ---------------------------------------------------------------- tənzimləmələr
def load_env():
    path = os.path.join(BASE, ".env")
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


load_env()
TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8000"))
SCHEDULER = os.environ.get("SCHEDULER", "internal").strip().lower()  # internal | n8n
RUN_KEY = os.environ.get("RUN_KEY", "").strip()
DB_PATH = os.path.join(BASE, os.environ.get("DB_FILE", "skypulse.db"))
URGENT_EVERY_MIN = 15  # təcili yoxlama tezliyi
with open(os.path.join(BASE, "rules.json"), encoding="utf-8") as _f:
    RULES = json.load(_f)

BOT_USERNAME = ""
TICK_LOCK = threading.Lock()


def log(*a):
    print(datetime.now().strftime("%H:%M:%S"), *a, flush=True)


# ---------------------------------------------------------------- verilənlər bazası
DB_LOCK = threading.Lock()
DB = sqlite3.connect(DB_PATH, check_same_thread=False)
DB.row_factory = sqlite3.Row
DB.executescript(
    """
CREATE TABLE IF NOT EXISTS monitors(
  id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, chat_id INTEGER, lang TEXT DEFAULT 'az',
  kind TEXT NOT NULL, name TEXT, lat REAL, lon REAL, name2 TEXT, lat2 REAL, lon2 REAL,
  mode TEXT, depart TEXT, arrive TEXT, hazards TEXT,
  interval_min INTEGER, min_level INTEGER, only_changes INTEGER,
  end_at TEXT, status TEXT DEFAULT 'pending', next_due REAL DEFAULT 0, last_urgent REAL DEFAULT 0,
  last_sig TEXT DEFAULT '', created REAL);
CREATE TABLE IF NOT EXISTS sent_events(
  monitor_id INTEGER, event_key TEXT, sent_at REAL, PRIMARY KEY(monitor_id, event_key));
CREATE TABLE IF NOT EXISTS log(ts REAL, monitor_id INTEGER, kind TEXT, detail TEXT);
"""
)
DB.commit()


def db(sql, args=(), one=False):
    with DB_LOCK:
        cur = DB.execute(sql, args)
        DB.commit()
        rows = cur.fetchall()
    return (rows[0] if rows else None) if one else rows


def db_log(mid, kind, detail):
    db("INSERT INTO log VALUES(?,?,?,?)", (time.time(), mid, kind, str(detail)[:500]))


# ---------------------------------------------------------------- HTTP köməkçiləri
def get_json(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": "SkyPulse-demo/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def tg(method, _timeout=20, **params):
    if not TOKEN:
        raise RuntimeError("TELEGRAM_BOT_TOKEN yoxdur")
    data = json.dumps(params).encode("utf-8")
    req = urllib.request.Request(
        "https://api.telegram.org/bot" + TOKEN + "/" + method, data=data, headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=_timeout) as r:
            j = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        j = json.loads(e.read().decode("utf-8") or "{}")
    if not j.get("ok"):
        raise RuntimeError("Telegram: " + str(j.get("description")))
    return j["result"]


# ---------------------------------------------------------------- məlumat mənbələri
_wx_cache = {}


def get_weather(lat, lon):
    key = "%.2f,%.2f" % (lat, lon)
    hit = _wx_cache.get(key)
    if hit and time.time() - hit[0] < 600:
        return hit[1]
    url = (
        "https://api.open-meteo.com/v1/forecast?latitude=%s&longitude=%s" % (lat, lon)
        + "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m,precipitation"
        + "&hourly=temperature_2m,precipitation,weather_code,wind_gusts_10m,visibility"
        + "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum,wind_gusts_10m_max"
        + "&timezone=auto&forecast_days=16"
    )
    data = get_json(url)
    if "daily" not in data:
        raise RuntimeError("Open-Meteo cavabı natamamdır")
    _wx_cache[key] = (time.time(), data)
    return data


def get_marine(lat, lon):
    try:
        return get_json(
            "https://marine-api.open-meteo.com/v1/marine?latitude=%s&longitude=%s&daily=wave_height_max&timezone=auto&forecast_days=16"
            % (lat, lon)
        )
    except Exception:
        return None


def get_quakes(lat, lon, since_ts, minmag):
    start = datetime.fromtimestamp(since_ts, timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
    url = (
        "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=%s&longitude=%s&maxradiuskm=%s"
        "&minmagnitude=%s&starttime=%s&orderby=time&limit=20" % (lat, lon, RULES["quake_radius_km"], minmag, start)
    )
    out = []
    for f in get_json(url).get("features", []):
        p = f.get("properties", {})
        out.append({"id": f.get("id"), "mag": p.get("mag"), "place": p.get("place"), "time": p.get("time"), "url": p.get("url")})
    return out


# ---------------------------------------------------------------- risk qaydaları (app.js ilə eyni)
def level_up(v, th):
    if v is None:
        return 0
    return sum(1 for x in th if v >= x)


def level_down(v, th):
    if v is None:
        return 0
    return sum(1 for x in th if v <= x)


def daily_risks(wx, date_from, date_to, marine=None):
    d = wx.get("daily", {})
    vis = {}
    h = wx.get("hourly", {})
    for i, tm in enumerate(h.get("time", [])):
        v = (h.get("visibility") or [None] * (i + 1))[i]
        if v is None:
            continue
        day = tm[:10]
        if day not in vis or v < vis[day]:
            vis[day] = v
    out = []
    for i, date in enumerate(d.get("time", [])):
        if (date_from and date < date_from) or (date_to and date > date_to):
            continue

        def add(typ, lvl, val, unit):
            if lvl > 0:
                out.append({"type": typ, "level": lvl, "date": date, "value": val, "unit": unit})

        add("gust", level_up(d["wind_gusts_10m_max"][i], RULES["gust_kmh"]), d["wind_gusts_10m_max"][i], "km/h")
        add("precip", level_up(d["precipitation_sum"][i], RULES["precip_day_mm"]), d["precipitation_sum"][i], "mm")
        add("snow", level_up(d["snowfall_sum"][i], RULES["snow_day_cm"]), d["snowfall_sum"][i], "cm")
        add("heat", level_up(d["temperature_2m_max"][i], RULES["heat_c"]), d["temperature_2m_max"][i], "°C")
        add("cold", level_down(d["temperature_2m_min"][i], RULES["cold_c"]), d["temperature_2m_min"][i], "°C")
        add("visibility", level_down(vis.get(date), RULES["visibility_m"]), vis.get(date), "m")
        if d["weather_code"][i] in RULES["thunder_codes"]:
            add("thunder", RULES["thunder_level"], None, "")
    if marine and marine.get("daily"):
        for i, date in enumerate(marine["daily"].get("time", [])):
            if (date_from and date < date_from) or (date_to and date > date_to):
                continue
            v = marine["daily"]["wave_height_max"][i]
            lvl = level_up(v, RULES["wave_m"])
            if lvl:
                out.append({"type": "wave", "level": lvl, "date": date, "value": v, "unit": "m"})
    out.sort(key=lambda r: (-r["level"], r["date"]))
    return out


# ---------------------------------------------------------------- bot mətnləri
T = {
    "az": {
        "report": "SkyPulse hesabatı", "urgent": "TƏCİLİ: yeni risk", "now": "İndi", "gust": "külək", "risks": "Risklər",
        "none": "Qaydalarımıza görə diqqət tələb edən risk yoxdur. Bu, təhlükəsizlik zəmanəti deyil.",
        "note": "SkyPulse qiymətləndirməsidir, rəsmi xəbərdarlıq deyil. Rəsmi məlumat üçün yerli meteoroloji xidmətə baxın.",
        "quakes": "Zəlzələ (USGS, müşahidə)", "src": "Mənbə", "upd": "Yoxlanıb", "stop_btn": "Dayandır", "map_btn": "Xəritə",
        "linked": "Qoşuldu! Bu söhbətə SkyPulse hesabatları gələcək.", "bad_code": "Bu kod tapılmadı və ya artıq istifadə olunub. Saytda yeni link yaradın.",
        "expired": "Monitorinq müddəti bitdi", "stopped": "Monitorinq dayandırıldı", "hello": "Salam! Bu SkyPulse botudur. Monitorinqi saytda yaradın və “Telegram-ı aç” düyməsini basın.\n\n/now — indi yoxla\n/list — monitorinqlərim\n/stop — hamısını dayandır",
        "list_none": "Aktiv monitorinq yoxdur.", "at": "Bu saatda", "new": "YENİ", "lv": ["", "Sarı", "Narıncı", "Qırmızı"],
        "r": {"gust": "Güclü külək", "precip": "Güclü yağış", "snow": "Qar", "heat": "Bərk isti", "cold": "Şaxta", "visibility": "Zəif görünmə", "thunder": "İldırımlı tufan", "wave": "Yüksək dalğa", "quake": "Zəlzələ"},
        "err": "Məlumat mənbəyi cavab vermədi; növbəti yoxlamada yenidən cəhd olunacaq.",
    },
    "en": {
        "report": "SkyPulse report", "urgent": "URGENT: new risk", "now": "Now", "gust": "gusts", "risks": "Risks",
        "none": "Our rules show no risk that needs attention. This is not a safety guarantee.",
        "note": "SkyPulse assessment, not an official warning. Check your national weather service for official information.",
        "quakes": "Earthquakes (USGS, observed)", "src": "Source", "upd": "Checked", "stop_btn": "Stop", "map_btn": "Map",
        "linked": "Connected! SkyPulse reports will arrive in this chat.", "bad_code": "This code was not found or is already used. Create a new link on the website.",
        "expired": "Monitoring period ended", "stopped": "Monitoring stopped", "hello": "Hi! This is the SkyPulse bot. Create a monitor on the website and tap “Open Telegram”.\n\n/now — check now\n/list — my monitors\n/stop — stop all",
        "list_none": "No active monitors.", "at": "At this hour", "new": "NEW", "lv": ["", "Yellow", "Orange", "Red"],
        "r": {"gust": "Strong wind", "precip": "Heavy rain", "snow": "Snow", "heat": "Extreme heat", "cold": "Frost", "visibility": "Poor visibility", "thunder": "Thunderstorm", "wave": "High waves", "quake": "Earthquake"},
        "err": "A data source did not respond; the next check will try again.",
    },
    "ru": {
        "report": "Отчёт SkyPulse", "urgent": "СРОЧНО: новый риск", "now": "Сейчас", "gust": "порывы", "risks": "Риски",
        "none": "По нашим правилам рисков, требующих внимания, нет. Это не гарантия безопасности.",
        "note": "Оценка SkyPulse, не официальное предупреждение. Официальную информацию смотрите в местной метеослужбе.",
        "quakes": "Землетрясения (USGS, наблюдение)", "src": "Источник", "upd": "Проверено", "stop_btn": "Остановить", "map_btn": "Карта",
        "linked": "Подключено! Отчёты SkyPulse будут приходить в этот чат.", "bad_code": "Код не найден или уже использован. Создайте новую ссылку на сайте.",
        "expired": "Срок мониторинга истёк", "stopped": "Мониторинг остановлен", "hello": "Привет! Это бот SkyPulse. Создайте мониторинг на сайте и нажмите «Открыть Telegram».\n\n/now — проверить сейчас\n/list — мои мониторинги\n/stop — остановить все",
        "list_none": "Нет активных мониторингов.", "at": "В этот час", "new": "НОВОЕ", "lv": ["", "Жёлтый", "Оранжевый", "Красный"],
        "r": {"gust": "Сильный ветер", "precip": "Сильный дождь", "snow": "Снег", "heat": "Сильная жара", "cold": "Мороз", "visibility": "Плохая видимость", "thunder": "Гроза", "wave": "Высокие волны", "quake": "Землетрясение"},
        "err": "Источник данных не ответил; следующая проверка попробует снова.",
    },
}
DOT = ["", "🟡", "🟠", "🔴"]


def L(m):
    return T.get(m["lang"] or "az", T["az"])


def fmt(v, d=0):
    return "–" if v is None else ("%." + str(d) + "f") % v


# ---------------------------------------------------------------- yoxlama
def points_of(m):
    pts = [{"name": m["name"].split(" → ")[0] if m["kind"] == "trip" else m["name"], "lat": m["lat"], "lon": m["lon"], "time": m["depart"]}]
    if m["kind"] == "trip" and m["lat2"] is not None:
        pts.append({"name": m["name2"], "lat": m["lat2"], "lon": m["lon2"], "time": m["arrive"] or m["depart"]})
    return pts


def collect(m):
    """Monitorinq üçün bütün cari riskləri qaytarır: [(key, level, line)], plus 'now' sətirləri."""
    t = L(m)
    hazards = set(json.loads(m["hazards"] or "[]")) or None
    items, now_lines, errors = [], [], 0
    for idx, p in enumerate(points_of(m)):
        try:
            wx = get_weather(p["lat"], p["lon"])
        except Exception as e:
            errors += 1
            db_log(m["id"], "error", "weather: %s" % e)
            continue
        c = wx.get("current", {})
        now_lines.append(
            "<b>%s</b> — %s %s°, %s %s km/h"
            % (html.escape(p["name"] or ""), t["now"], fmt(c.get("temperature_2m")), t["gust"], fmt(c.get("wind_gusts_10m")))
        )
        if m["kind"] == "trip" and p["time"]:
            hk = p["time"][:13] + ":00"
            hours = wx["hourly"]["time"]
            if hk in hours:
                i = hours.index(hk)
                now_lines.append(
                    "   %s %s: %s°, %s %s km/h, %s mm"
                    % (t["at"], p["time"][11:16], fmt(wx["hourly"]["temperature_2m"][i]), t["gust"],
                       fmt(wx["hourly"]["wind_gusts_10m"][i]), fmt(wx["hourly"]["precipitation"][i], 1))
                )
        days = wx["daily"]["time"]
        if m["kind"] == "trip":
            d_from = (m["depart"] or days[0])[:10]
            d_to = (m["arrive"] or m["depart"] or days[2])[:10]
        else:
            d_from, d_to = days[0], days[min(2, len(days) - 1)]
        marine = get_marine(p["lat"], p["lon"]) if m["mode"] == "sea" else None
        for r in daily_risks(wx, d_from, d_to, marine):
            if r["level"] < m["min_level"] or (hazards and r["type"] not in hazards):
                continue
            val = "" if r["value"] is None else " · %s %s" % (fmt(r["value"], 1 if r["type"] == "wave" else 0), r["unit"])
            line = "%s %s — %s%s · %s.%s" % (DOT[r["level"]], t["r"][r["type"]], html.escape(p["name"] or ""), val, r["date"][8:10], r["date"][5:7])
            items.append(("w:%d:%s:%s:%d" % (idx, r["type"], r["date"], r["level"]), r["level"], line))
        if hazards is None or "quake" in hazards:
            try:
                since = max(m["created"], time.time() - 86400)
                for q in get_quakes(p["lat"], p["lon"], since, RULES["quake_alert_mag"]):
                    lvl = 3 if (q["mag"] or 0) >= 6 else 2
                    when = datetime.fromtimestamp(q["time"] / 1000, timezone.utc).strftime("%d.%m %H:%M UTC")
                    line = '%s %s M%s — %s · %s · <a href="%s">USGS</a>' % (
                        DOT[lvl], t["r"]["quake"], fmt(q["mag"], 1), html.escape(q["place"] or ""), when, html.escape(q["url"] or ""))
                    items.append(("q:%s" % q["id"], lvl, line))
            except Exception as e:
                errors += 1
                db_log(m["id"], "error", "usgs: %s" % e)
    return items, now_lines, errors


def build_message(m, title, items, now_lines, new_keys, errors):
    t = L(m)
    parts = ["<b>%s</b> · %s" % (title, html.escape(m["name"] or ""))]
    parts += now_lines
    parts.append("")
    if items:
        parts.append("<b>%s</b>" % t["risks"])
        for key, lvl, line in sorted(items, key=lambda x: -x[1]):
            parts.append(line + (" · <b>%s</b>" % t["new"] if key in new_keys else ""))
    else:
        parts.append(t["none"])
    if errors:
        parts.append("⚠️ " + t["err"])
    parts.append("")
    parts.append("<i>%s</i>" % t["note"])
    parts.append("%s: Open-Meteo.com, earthquake.usgs.gov · %s %s" % (t["src"], t["upd"], datetime.now().strftime("%d.%m %H:%M")))
    return "\n".join(parts)[:4000]


def keyboard(m):
    t = L(m)
    url = "https://www.openstreetmap.org/?mlat=%s&mlon=%s#map=8/%s/%s" % (m["lat"], m["lon"], m["lat"], m["lon"])
    return {"inline_keyboard": [[{"text": t["map_btn"], "url": url}, {"text": t["stop_btn"], "callback_data": "stop:" + m["code"]}]]}


def send(m, text):
    tg("sendMessage", chat_id=m["chat_id"], text=text, parse_mode="HTML", disable_web_page_preview=True, reply_markup=keyboard(m))


def check_monitor(m, scheduled, force=False):
    """scheduled=True: planlı hesabat. False: yalnız yeni təcili risklər. Qaytarır: 'sent'/'skipped'/'urgent'."""
    items, now_lines, errors = collect(m)
    sent_keys = {r["event_key"] for r in db("SELECT event_key FROM sent_events WHERE monitor_id=?", (m["id"],))}
    keys = [k for k, _, _ in items]
    new_keys = {k for k in keys if k not in sent_keys}
    sig = "|".join(sorted(keys))
    now = time.time()
    result = "skipped"
    if scheduled:
        changed = sig != m["last_sig"]
        if force or not m["only_changes"] or changed:
            send(m, build_message(m, L(m)["report"], items, now_lines, new_keys, errors))
            result = "sent"
        db("UPDATE monitors SET next_due=?, last_urgent=?, last_sig=? WHERE id=?", (now + m["interval_min"] * 60, now, sig, m["id"]))
    else:
        urgent = [x for x in items if x[0] in new_keys and x[1] >= 2]
        if urgent:
            send(m, build_message(m, L(m)["urgent"], urgent, now_lines, new_keys, errors))
            result = "urgent"
            new_keys = {x[0] for x in urgent}
        else:
            new_keys = set()
        db("UPDATE monitors SET last_urgent=? WHERE id=?", (now, m["id"]))
    if result != "skipped":
        for k in new_keys:
            db("INSERT OR IGNORE INTO sent_events VALUES(?,?,?)", (m["id"], k, now))
    db_log(m["id"], result, "%d items, %d new, %d errors" % (len(items), len(new_keys), errors))
    return result


def tick():
    """Bir yoxlama dövrü. Daxili planlayıcı və ya n8n çağırır."""
    if not TOKEN:
        return {"error": "no token"}
    if not TICK_LOCK.acquire(blocking=False):
        return {"busy": True}
    summary = {"checked": 0, "sent": 0, "urgent": 0, "expired": 0, "errors": 0}
    try:
        now = time.time()
        for m in db("SELECT * FROM monitors WHERE status='active'"):
            try:
                if m["end_at"] and datetime.fromisoformat(m["end_at"]).timestamp() < now:
                    db("UPDATE monitors SET status='expired' WHERE id=?", (m["id"],))
                    tg("sendMessage", chat_id=m["chat_id"], text="%s: %s" % (L(m)["expired"], m["name"]))
                    summary["expired"] += 1
                    continue
                if now >= m["next_due"]:
                    r = check_monitor(m, scheduled=True)
                elif now - m["last_urgent"] >= URGENT_EVERY_MIN * 60:
                    r = check_monitor(m, scheduled=False)
                else:
                    continue
                summary["checked"] += 1
                if r in ("sent", "urgent"):
                    summary["sent" if r == "sent" else "urgent"] += 1
            except Exception as e:
                summary["errors"] += 1
                db_log(m["id"], "error", e)
                log("check error", m["code"], e)
    finally:
        TICK_LOCK.release()
    return summary


def scheduler_loop():
    log("Daxili planlayıcı işləyir (hər 60 saniyə).")
    while True:
        try:
            s = tick()
            if s.get("checked"):
                log("tick", s)
        except Exception:
            traceback.print_exc()
        time.sleep(60)


# ---------------------------------------------------------------- Telegram botu
def handle_update(u):
    if "callback_query" in u:
        cq = u["callback_query"]
        data = cq.get("data", "")
        chat_id = cq["message"]["chat"]["id"]
        if data.startswith("stop:"):
            m = db("SELECT * FROM monitors WHERE code=? AND chat_id=?", (data[5:], chat_id), one=True)
            if m:
                db("UPDATE monitors SET status='stopped' WHERE id=?", (m["id"],))
                tg("answerCallbackQuery", callback_query_id=cq["id"], text=L(m)["stopped"])
                tg("sendMessage", chat_id=chat_id, text="%s: %s" % (L(m)["stopped"], m["name"]))
                return
        tg("answerCallbackQuery", callback_query_id=cq["id"])
        return
    msg = u.get("message") or {}
    text = (msg.get("text") or "").strip()
    chat_id = (msg.get("chat") or {}).get("id")
    if not chat_id or not text:
        return
    lang = (msg.get("from") or {}).get("language_code", "az")[:2]
    t = T.get(lang, T["az"])
    if text.startswith("/start"):
        code = text[6:].strip()
        if not code:
            tg("sendMessage", chat_id=chat_id, text=t["hello"])
            return
        m = db("SELECT * FROM monitors WHERE code=?", (code,), one=True)
        if not m or m["status"] != "pending":
            tg("sendMessage", chat_id=chat_id, text=t["bad_code"])
            return
        db("UPDATE monitors SET chat_id=?, status='active', next_due=0 WHERE id=?", (chat_id, m["id"]))
        m = db("SELECT * FROM monitors WHERE id=?", (m["id"],), one=True)
        tg("sendMessage", chat_id=chat_id, text=L(m)["linked"] + "\n" + m["name"])
        threading.Thread(target=lambda: safe_check(m, force=True), daemon=True).start()
    elif text.startswith("/now"):
        rows = db("SELECT * FROM monitors WHERE chat_id=? AND status='active'", (chat_id,))
        if not rows:
            tg("sendMessage", chat_id=chat_id, text=t["list_none"])
        for m in rows:
            threading.Thread(target=lambda m=m: safe_check(m, force=True), daemon=True).start()
    elif text.startswith("/list"):
        rows = db("SELECT * FROM monitors WHERE chat_id=? AND status='active'", (chat_id,))
        tg("sendMessage", chat_id=chat_id, text="\n".join("• %s (→ %s)" % (r["name"], (r["end_at"] or "")[:16].replace("T", " ")) for r in rows) or t["list_none"])
    elif text.startswith("/stop"):
        db("UPDATE monitors SET status='stopped' WHERE chat_id=? AND status='active'", (chat_id,))
        tg("sendMessage", chat_id=chat_id, text=t["stopped"])
    else:
        tg("sendMessage", chat_id=chat_id, text=t["hello"])


def safe_check(m, force=False):
    try:
        check_monitor(m, scheduled=True, force=force)
    except Exception as e:
        db_log(m["id"], "error", e)
        log("check error", e)


def bot_loop():
    offset = 0
    log("Telegram botu dinləyir: @%s" % BOT_USERNAME)
    while True:
        try:
            for u in tg("getUpdates", _timeout=40, offset=offset, timeout=25, allowed_updates=["message", "callback_query"]):
                offset = u["update_id"] + 1
                try:
                    handle_update(u)
                except Exception as e:
                    log("update error", e)
        except Exception as e:
            log("getUpdates xətası:", e)
            time.sleep(5)


# ---------------------------------------------------------------- veb server və API
ALLOWED_EXT = {".html", ".js", ".json", ".css", ".svg", ".png", ".webmanifest", ".ico"}
VALID_IV = {30, 60, 120, 360, 1440}
VALID_HAZ = {"gust", "precip", "snow", "heat", "cold", "visibility", "thunder", "wave", "quake"}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=BASE, **kw)

    def log_message(self, fmt_, *args):
        pass  # konsolu təmiz saxla

    def send_json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def read_body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > 20000:
            raise ValueError("too large")
        return json.loads(self.rfile.read(n).decode("utf-8") or "{}")

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path == "/api/health":
            return self.send_json(200, {"ok": True, "telegram": bool(TOKEN and BOT_USERNAME), "bot_username": BOT_USERNAME, "scheduler": SCHEDULER})
        if u.path == "/api/monitors":
            codes = [c for c in urllib.parse.parse_qs(u.query).get("codes", [""])[0].split(",") if c][:50]
            out = []
            for c in codes:
                m = db("SELECT code,name,status,end_at,interval_min,next_due FROM monitors WHERE code=?", (c,), one=True)
                if m:
                    out.append(dict(m))
            return self.send_json(200, {"monitors": out})
        if u.path.startswith("/api/"):
            return self.send_json(404, {"error": "not found"})
        # Statik fayllar: yalnız icazəli növlər, gizli fayllar (.env) və baza bağlıdır
        path = u.path if u.path != "/" else "/index.html"
        parts = [p for p in path.split("/") if p]
        ext = os.path.splitext(path)[1].lower()
        if any(p.startswith(".") for p in parts) or ext not in ALLOWED_EXT:
            self.send_error(404)
            return
        self.path = path
        return super().do_GET()

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        try:
            if u.path == "/api/monitors":
                return self.create_monitor(self.read_body())
            if u.path.startswith("/api/monitors/") and u.path.endswith("/stop"):
                code = u.path.split("/")[3]
                m = db("SELECT * FROM monitors WHERE code=?", (code,), one=True)
                if not m:
                    return self.send_json(404, {"error": "not found"})
                db("UPDATE monitors SET status='stopped' WHERE id=?", (m["id"],))
                if m["chat_id"] and TOKEN:
                    try:
                        tg("sendMessage", chat_id=m["chat_id"], text="%s: %s" % (L(m)["stopped"], m["name"]))
                    except Exception:
                        pass
                return self.send_json(200, {"ok": True})
            if u.path == "/api/run-checks":
                local = self.client_address[0] in ("127.0.0.1", "::1")
                if RUN_KEY and self.headers.get("X-SkyPulse-Key") != RUN_KEY:
                    return self.send_json(403, {"error": "bad key"})
                if not RUN_KEY and not local:
                    return self.send_json(403, {"error": "set RUN_KEY in .env"})
                return self.send_json(200, tick())
            return self.send_json(404, {"error": "not found"})
        except (ValueError, KeyError, TypeError) as e:
            return self.send_json(400, {"error": "bad request: %s" % e})

    def create_monitor(self, b):
        if not (TOKEN and BOT_USERNAME):
            return self.send_json(503, {"error": "Telegram bot qoşulmayıb: .env faylında TELEGRAM_BOT_TOKEN yazın və serveri yenidən başladın."})
        if db("SELECT COUNT(*) n FROM monitors WHERE status IN ('pending','active')", one=True)["n"] >= 200:
            return self.send_json(429, {"error": "too many monitors"})
        kind = b.get("kind")
        if kind not in ("place", "trip"):
            raise ValueError("kind")
        lat, lon = float(b["lat"]), float(b["lon"])
        lat2 = float(b["lat2"]) if b.get("lat2") is not None else None
        lon2 = float(b["lon2"]) if b.get("lon2") is not None else None
        for a, o in ((lat, lon), (lat2, lon2)):
            if a is not None and not (-90 <= a <= 90 and -180 <= o <= 180):
                raise ValueError("coordinates")
        iv = int(b.get("interval_min", 120))
        if iv not in VALID_IV:
            raise ValueError("interval")
        days = max(1, min(16, int(b.get("days", 3))))
        min_level = max(1, min(3, int(b.get("min_level", 1))))
        hazards = [h for h in (b.get("hazards") or []) if h in VALID_HAZ]
        mode = b.get("mode") if b.get("mode") in ("road", "air", "sea") else None
        depart = str(b.get("depart") or "")[:16] or None
        arrive = str(b.get("arrive") or "")[:16] or None
        lang = b.get("lang") if b.get("lang") in T else "az"
        code = secrets.token_urlsafe(12)
        end_at = (datetime.now() + timedelta(days=days)).isoformat(timespec="minutes")
        db(
            "INSERT INTO monitors(code,lang,kind,name,lat,lon,name2,lat2,lon2,mode,depart,arrive,hazards,interval_min,min_level,only_changes,end_at,status,created)"
            " VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?)",
            (code, lang, kind, str(b.get("name") or "")[:80], lat, lon, (str(b.get("name2") or "")[:80] or None), lat2, lon2,
             mode, depart, arrive, json.dumps(hazards), iv, min_level, 1 if b.get("only_changes") else 0, end_at, time.time()),
        )
        return self.send_json(200, {"code": code, "link": "https://t.me/%s?start=%s" % (BOT_USERNAME, code)})


def keep_awake_loop(url):
    """Render pulsuz planı 15 dəq trafiksiz qalanda yatır. Öz ictimai ünvanına 10 dəqiqədən bir sorğu göndəririk."""
    while True:
        time.sleep(600)
        try:
            urllib.request.urlopen(url.rstrip("/") + "/api/health", timeout=30).read()
        except Exception as e:
            log("keep-awake:", e)


def main():
    global BOT_USERNAME
    ext = os.environ.get("RENDER_EXTERNAL_URL", "").strip()
    if ext:
        threading.Thread(target=keep_awake_loop, args=(ext,), daemon=True).start()
        log("Render rejimi: %s (oyaq saxlama aktivdir)" % ext)
    if TOKEN:
        try:
            BOT_USERNAME = tg("getMe")["username"]
            threading.Thread(target=bot_loop, daemon=True).start()
            if SCHEDULER == "internal":
                threading.Thread(target=scheduler_loop, daemon=True).start()
            else:
                log("Daxili planlayıcı söndürülüb (SCHEDULER=n8n). n8n /api/run-checks çağırmalıdır.")
        except Exception as e:
            log("Telegram-a qoşulmaq alınmadı:", e)
    else:
        log("XƏBƏRDARLIQ: TELEGRAM_BOT_TOKEN yoxdur. Sayt işləyəcək, Telegram bildirişləri yox.")
    srv = ThreadingHTTPServer((HOST, PORT), Handler)
    log("SkyPulse hazırdır: http://localhost:%d  (dayandırmaq üçün Ctrl+C)" % PORT)
    if HOST == "0.0.0.0":
        try:
            import socket
            s_ = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s_.connect(("8.8.8.8", 80))
            ip = s_.getsockname()[0]
            s_.close()
            log("TELEFON ÜÇÜN (eyni Wi-Fi): http://%s:%d" % (ip, PORT))
        except Exception:
            log("Telefon ünvanı tapılmadı. PowerShell-də ipconfig yazın.")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        log("Dayandırıldı.")


if __name__ == "__main__":
    if sys.version_info < (3, 9):
        sys.exit("Python 3.9 və ya daha yeni versiya lazımdır.")
    main()
