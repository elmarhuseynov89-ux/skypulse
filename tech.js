// "SkyPulse necə işləyir" cədvəli. Yalnız həqiqətən istifadə olunanlar "istifadə olunur" kimi qeyd edilir.
// Sütunlar: [Alət, Harada, Nə edir, Status]
window.SKYPULSE_TECH = {
  az: [
    ["Claude", "Hazırlama", "Kodu yazdı və sazladı", "İstifadə olunub"],
    ["Python 3 (əlavə paketsiz)", "server.py", "Saytı açır, API, Telegram botu, planlı yoxlama, risk qaydaları", "İstifadə olunur"],
    ["SQLite", "skypulse.db", "Monitorinqlər, göndərilmiş xəbərdarlıqlar, jurnal", "İstifadə olunur"],
    ["Open-Meteo", "Hava, axtarış, dəniz", "Proqnoz, cari hava, yer axtarışı, dalğa hündürlüyü (açarsız, qeyri-kommersiya üçün pulsuz)", "Real mənbə"],
    ["USGS", "Zəlzələlər", "Müşahidə olunmuş və tarixi zəlzələlər", "Real mənbə"],
    ["Leaflet + OpenStreetMap", "Xəritə", "Xəritə plitələri və işarələr", "İstifadə olunur"],
    ["Telegram Bot API", "Bildirişlər", "Start ilə qoşulma, hesabatlar, təcili xəbərdarlıqlar, Dayandır düyməsi", "Sizin bot tokeninizlə işləyir"],
    ["n8n", "Avtomatlaşdırma (istəyə görə)", "Hər 30 dəq server.py-yə yoxlama əmri göndərir", "Hazırdır, sınaqdan keçirilməyib"],
    ["PWA (manifest, service worker)", "Quraşdırma", "Telefon və kompüterə əlavə etmək", "Yalnız HTTPS və ya localhost-da"],
    ["Git/GitHub", "Versiya nəzarəti", "—", "Hələ istifadə olunmur"],
    ["Hosting", "Onlayn işləmə", "Hazırda öz kompüterinizdə işləyir", "Pulsuz hosting hələ qurulmayıb"]
  ],
  en: [
    ["Claude", "Development", "Wrote and debugged the code", "Used"],
    ["Python 3 (no extra packages)", "server.py", "Serves the app, API, Telegram bot, scheduled checks, risk rules", "Used"],
    ["SQLite", "skypulse.db", "Monitors, sent alerts, log", "Used"],
    ["Open-Meteo", "Weather, search, marine", "Forecast, current weather, place search, wave height (no key, free for non-commercial use)", "Real source"],
    ["USGS", "Earthquakes", "Observed and historical earthquakes", "Real source"],
    ["Leaflet + OpenStreetMap", "Map", "Map tiles and markers", "Used"],
    ["Telegram Bot API", "Notifications", "Start linking, reports, urgent alerts, Stop button", "Works with your bot token"],
    ["n8n", "Automation (optional)", "Calls server.py's check every 30 min", "Prepared, not tested"],
    ["PWA (manifest, service worker)", "Install", "Add to phone and computer", "Only on HTTPS or localhost"],
    ["Git/GitHub", "Version control", "—", "Not used yet"],
    ["Hosting", "Online availability", "Currently runs on your own computer", "Free hosting not set up yet"]
  ],
  ru: [
    ["Claude", "Разработка", "Написал и отладил код", "Использован"],
    ["Python 3 (без доп. пакетов)", "server.py", "Отдаёт сайт, API, Telegram-бот, плановые проверки, правила рисков", "Используется"],
    ["SQLite", "skypulse.db", "Мониторинги, отправленные оповещения, журнал", "Используется"],
    ["Open-Meteo", "Погода, поиск, море", "Прогноз, текущая погода, поиск мест, высота волн (без ключа, бесплатно для некоммерческого использования)", "Реальный источник"],
    ["USGS", "Землетрясения", "Наблюдённые и исторические землетрясения", "Реальный источник"],
    ["Leaflet + OpenStreetMap", "Карта", "Тайлы карты и метки", "Используется"],
    ["Telegram Bot API", "Уведомления", "Привязка через Start, отчёты, срочные оповещения, кнопка «Стоп»", "Работает с вашим токеном бота"],
    ["n8n", "Автоматизация (по желанию)", "Каждые 30 мин запускает проверку в server.py", "Подготовлено, не протестировано"],
    ["PWA (manifest, service worker)", "Установка", "Добавление на телефон и компьютер", "Только на HTTPS или localhost"],
    ["Git/GitHub", "Контроль версий", "—", "Пока не используется"],
    ["Хостинг", "Работа онлайн", "Сейчас работает на вашем компьютере", "Бесплатный хостинг ещё не настроен"]
  ]
};
