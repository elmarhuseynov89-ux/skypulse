// SkyPulse tənzimləmələri. Burada heç bir gizli açar (token) saxlanmır.
window.SKYPULSE_CONFIG = {
  // Standart məkan (ilk açılışda göstərilir)
  defaultPlace: { name: "Bakı", country: "Azərbaycan", lat: 40.4093, lon: 49.8671 },

  // Kiçik reklam blokları. Silmək üçün enabled: false yazın.
  promos: {
    course: {
      enabled: true,
      title: "LTCLB",
      // Kursun dəqiq adını, mövzusunu və linkini buraya yazın (dərs materiallarından).
      text: { az: "Kurs layihəsi", en: "Course project", ru: "Курсовой проект" },
      link: ""
    },
    kunefe: {
      enabled: true,
      title: "ES-ES KÜNƏFƏ",
      text: {
        az: "Gənclik m. yaxınlığı · Sifariş: 070 600 84 84 · Instagram @kunefe.az",
        en: "Near Ganjlik metro · Orders: 070 600 84 84 · Instagram @kunefe.az",
        ru: "Рядом с м. Гянджлик · Заказ: 070 600 84 84 · Instagram @kunefe.az"
      },
      link: "https://www.instagram.com/kunefe.az/"
    }
  }
};
