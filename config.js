// SkyPulse tənzimləmələri. Burada heç bir gizli açar (token) saxlanmır.
window.SKYPULSE_CONFIG = {
  // Standart məkan (ilk açılışda göstərilir)
  defaultPlace: { name: "Bakı", country: "Azərbaycan", lat: 40.4093, lon: 49.8671 },

  // Kiçik reklam blokları. Silmək üçün enabled: false yazın.
  promos: {
    course: {
      enabled: true,
      title: "LTC Lab",
      badge: { az: "KURS", en: "COURSE", ru: "КУРС" },
      text: {
        az: "Süni intellekt mühəndisliyi kursu",
        en: "AI engineering course",
        ru: "Курс инженерии искусственного интеллекта"
      },
      link: ""
    },
    kunefe: {
      enabled: true,
      title: "ES-ES KÜNƏFƏ",
      badge: { az: "YENİ", en: "NEW", ru: "НОВИНКА" },
      text: {
        az: "Yeni məhsullar: düşbərə, pelmeni, qürzə · Tezliklə: südlü paxlava · Sifariş: 070 600 84 84",
        en: "New: dushbara, pelmeni, gurza · Coming soon: milk baklava · Orders: 070 600 84 84",
        ru: "Новинки: дюшбара, пельмени, гюрза · Скоро: молочная пахлава · Заказ: 070 600 84 84"
      },
      link: "https://www.instagram.com/kunefe.az/",
      linkLabel: "@kunefe.az"
    }
  }
};
