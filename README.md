# SkyPulse — demo

Hava, zəlzələ və səfər riski monitorinqi + Telegram bildirişləri. Azərbaycan, ingilis, rus dilləri.

## 1. İşə salmaq (Windows, 2 dəqiqə)

1. Bu qovluğu kompüterə açın, məsələn: `C:\Users\<siz>\skypulse`
2. Python yoxdursa: https://www.python.org/downloads/ — quraşdırarkən **“Add Python to PATH”** seçin. Əlavə paket lazım deyil.
3. PowerShell-i bu qovluqda açın və yazın:

```
cd C:\Users\<siz>\skypulse
python server.py
```

4. Brauzerdə açın: **http://localhost:8000**

Hava, axtarış, xəritə, səfər, biznes və tarixçə **Telegram olmadan da** işləyir.

## 2. Telegram botunu qoşmaq

1. Telegram-da **@BotFather** açın → `/newbot` → ad verin (məs. `SkyPulse Elmar`) → istifadəçi adı (`..._bot` ilə bitməlidir).
2. BotFather sizə **token** verəcək. Onu heç kimə göstərməyin.
3. Qovluqda `.env.example` faylını kopyalayın, adını `.env` edin və tokeni yazın:
   ```
   TELEGRAM_BOT_TOKEN=123456:ABC...
   ```
4. Serveri dayandırın (Ctrl+C) və yenidən `python server.py` yazın. Konsolda `Telegram botu dinləyir: @...` görünməlidir.
5. Saytda **“Bu yeri izlə”** → tezlik seçin → **“Linki yarat və Telegram-ı aç”** → Telegram-da **Start**. İlk hesabat dərhal gəlir.

Bot əmrləri: `/now` — indi yoxla, `/list` — monitorinqlərim, `/stop` — hamısını dayandır.

**Vacib:** bildirişlər yalnız `server.py` işləyəndə gedir. Kompüter sönsə və ya yuxu rejiminə keçsə, mesaj gəlməyəcək.

## 3. n8n (istəyə görə)

`server.py` yoxlamanı özü edir, n8n mütləq deyil. n8n ilə idarə etmək istəsəniz:
1. `.env`-də: `SCHEDULER=n8n` və `RUN_KEY=istənilən-uzun-gizli-söz`
2. n8n-də **Import from file** → `n8n/SkyPulse_Scheduled_Risk_Monitor.json`
3. “Run SkyPulse checks” düyünündə `PASTE_RUN_KEY_FROM_.env` yerinə həmin sözü yazın, workflow-u aktiv edin.

Workflow: hər 5 dəqiqə → `POST /api/run-checks` → server vaxtı çatan monitorinqləri yoxlayır, Telegram-a yazır, cavabda say qaytarır (`checked`, `sent`, `urgent`, `expired`, `errors`). Bu fayl sınaqdan keçirilməyib.

## 4. Telefonda açmaq

- **Eyni Wi-Fi:** `.env`-də `HOST=0.0.0.0`, serveri yenidən başladın, telefonda `http://<kompüterin-IP>:8000`. (IP: PowerShell-də `ipconfig`.) Bu halda “Ana ekrana əlavə et” (PWA) işləməyə bilər, çünki HTTPS deyil.
- **İnternetdən hər yerdən və quraşdırılabilən PWA:** pulsuz HTTPS hosting lazımdır — növbəti mərhələ.

## 5. Risk necə hesablanır

`rules.json` faylındakı sabit həddlər (sarı / narıncı / qırmızı): küləyin şiddəti, gündəlik yağış, qar, isti, şaxta, görünmə, ildırım, dalğa. Eyni fayl həm sayt, həm bot tərəfindən oxunur. Bunlar **SkyPulse qiymətləndirməsidir, rəsmi xəbərdarlıq deyil.** Zəlzələlər yalnız **müşahidə olunmuş** hadisələrdir (USGS); SkyPulse zəlzələ proqnozlaşdırmır.

Təkrar göndərməmək üçün: hər göndərilmiş risk və zəlzələ `skypulse.db`-də yadda saxlanır; “yalnız dəyişiklik olanda” seçilibsə, risk siyahısı dəyişmədikcə planlı hesabat göndərilmir. Yeni narıncı/qırmızı risk və M4.5+ zəlzələ 15 dəqiqəlik yoxlamada dərhal göndərilir.

## 6. Nə işləyir, nə yox

| Hissə | Status |
|---|---|
| Hava (cari, 24 saat, 16 gün), yer axtarışı — Open-Meteo | İşləyir |
| Yaxın zəlzələlər + 5/10/20 illik tarixçə — USGS | İşləyir |
| Xəritə — Leaflet + OpenStreetMap | İşləyir |
| 3 dil, yadda saxlanan yerlər, offline-da köhnə məlumatın işarələnməsi | İşləyir |
| Səfər: başlanğıc/təyinat, gediş və çatma saatında hava, dəniz üçün dalğa | İşləyir |
| Biznes xatırlatmaları (restoran, tikinti, logistika) | İşləyir |
| Telegram qoşulma, hesabat, təcili xəbərdarlıq, təkrarın qarşısı, Dayandır, müddətin bitməsi | Saxta məlumatla sınaqdan keçib; real bot sizin tokeninizlə yoxlanmalıdır |
| n8n workflow | Hazırdır, sınaqdan keçməyib |
| Rəsmi xəbərdarlıqlar (GDACS, MeteoAlarm və s.) | Hələ qoşulmayıb — saytda açıq yazılıb |
| Real yol marşrutu, yol bağlanmaları, uçuş statusu | Yoxdur, uydurulmur |
| İnternetdə hosting, Git/GitHub | Hələ yoxdur |

## Fayllar

- `index.html`, `app.js` — sayt
- `i18n.js` — tərcümələr, `tech.js` — “necə işləyir” cədvəli
- `config.js` — standart məkan və reklam blokları (LTCLB kursu üçün dəqiq adı və linki buraya yazın)
- `rules.json` — risk həddləri
- `server.py` — server, bot, planlayıcı
- `.env` — gizli token (GitHub-a yükləmək olmaz; `.gitignore`-da var)
