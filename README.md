# Projecty — uy konstruktori

Bir yoki ikki qavatli uy rejasini chizib, isitish, elektr va santexnika tizimlarini loyihalash uchun sayt. Yig'ish bosqichi yo'q: oddiy HTML, CSS va JS modullari.

## Imkoniyatlar

- **Reja:** xona chizish, eshik va deraza qo'yish, o'lchamlarni tahrirlash, qavatlar, zina va stoyak.
- **Isitish:** issiqlik yo'qotish, radiator tanlash va joylash, qozon quvvati, quvur yo'li. Suv aylanishi: nasos, o'zi aylanadigan yoki gibrid. Tizim: ochiq yoki yopiq.
- **Iliq pol va kollektor:** xona bo'yicha iliq pol, quvur qadami va qoplama, konturlar soni, kollektor va aralashtirish uzeli. Radiatorlarni troynikli yoki kollektordan nurli ulash.
- **Radiatorlar:** cho'yan, bimetall yoki po'lat panel. Joyini surish, sonini va o'lchamini qo'lda berish mumkin.
- **Isitish detallari:** xavfsizlik guruhi qismlari, membranali yoki ochiq bak, termomanometr, loyqa filtr, to'ldirish va to'kish kranlari, radiator kranlari, fitinglar, tutun quvuri.
- **Elektr:** guruhlarga bo'lish, avtomat va kabel tanlash, taqsimlash korobkasi bilan yoki korobkasiz montaj. Chiroq turlari, o'rnatish balandligi, mis yoki alyuminiy sim, kesim va kuchlanish tushishi. Korobkadan viklyuchatel, chiroq va rozetkaga ulanish sxemasi, qaysi viklyuchatel qaysi chiroqni yoqishi.
- **Santexnika:** shahar suvi yoki suv bochkasi (yerda, tagkursida, tomda, nasos stansiyasi bilan), bosim tekshiruvi. Sovuq va issiq suv quvuri diametri, kranlar va fitinglar. Kanalizatsiya diametri, nishabligi, chiqishdagi chuqurlik, reviziyalar va ventilyatsiya stoyagi.
- **3D:** uy va tizimlarning aylantiriladigan modeli.
- **Hisob:** materiallar ro'yxati va narx, qo'lda qator qo'shish, chop etish. Projecty brendi va logosi bilan Excel (.xlsx) va PDF fayl qilib yuklab olish.

Loyiha brauzerda avtomatik saqlanadi va JSON fayl qilib yuklab olinadi.

## Ishga tushirish

ES modullar server orqali ochiladi:

```bash
python -m http.server 8000
```

So'ng `http://localhost:8000` manzilini oching.

## Joylash

Netlify'da shu repozitoriyani ulang. Sozlamalar `netlify.toml` faylida, build buyrug'i kerak emas.

## Eslatma

Natijalar dastlabki loyiha uchun. Qurilishdan oldin mutaxassis tekshirishi kerak, gaz va elektr ishlarini litsenziyali usta bajaradi. Standart ish narxlari taxminiy.
