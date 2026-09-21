/**
 * Готовые тексты рассылок на трёх языках. Админ выбирает шаблон — тексты подставляются в поля
 * ru/tg/uz, их можно править. Плейсхолдеры `{siteUrl}` и `{botUrl}` заменяются при отправке
 * (см. broadcast/actions.ts). Значения в квадратных скобках [ ] — то, что админ должен заполнить
 * сам перед отправкой (иначе отправка не пройдёт).
 * Переводы tg/uz машинного уровня — перед использованием их стоит показать носителям языка.
 */
import type { Segment } from "./broadcast-segments";
import type { Locale } from "./i18n/shared";

export const BOT_URL = "https://t.me/cafeteria_farovon_bot";

export type BroadcastTemplate = {
  id: string;
  segment: Segment;
  title: Record<Locale, string>;
  text: Record<Locale, string>;
};

export const BROADCAST_TEMPLATES: BroadcastTemplate[] = [
  {
    id: "not-registered",
    segment: "NOT_REGISTERED",
    title: {
      ru: "Нажал «Старт», но не зарегистрировался",
      tg: "«Старт» пахш кард, вале ба қайд нагирифт",
      uz: "«Start» bosdi, lekin ro'yxatdan o'tmadi",
    },
    text: {
      ru:
        "Здравствуйте! Вы запустили бота «Кафетерий льгот Фаровон», но регистрация не завершена.\n\n" +
        "Чтобы получить доступ к льготам:\n" +
        "1. Нажмите кнопку «📱 Поделиться контактом» в чате с ботом — он проверит ваш номер.\n" +
        "2. Бот пришлёт логин и одноразовый пароль.\n" +
        "3. Войдите на {siteUrl} и задайте свой пароль.\n\n" +
        "Если бот не находит ваш номер, напишите администратору прямо в этом чате.",
      tg:
        "Салом! Шумо ботро оғоз кардед, вале сабти ном ба анҷом нарасидааст.\n\n" +
        "Барои дастрасӣ ба имтиёзҳо:\n" +
        "1. Дар чат бо бот тугмаи «📱 Мубодилаи тамос»-ро пахш кунед — бот рақами шуморо месанҷад.\n" +
        "2. Бот логин ва рамзи якдафъаина мефиристад.\n" +
        "3. Ба {siteUrl} ворид шуда, рамзи худро таъйин кунед.\n\n" +
        "Агар бот рақами шуморо наёбад, ҳамин ҷо ба маъмур нависед.",
      uz:
        "Assalomu alaykum! Siz botni ishga tushirdingiz, ammo ro'yxatdan o'tish yakunlanmagan.\n\n" +
        "Imtiyozlardan foydalanish uchun:\n" +
        "1. Bot bilan chatda «📱 Kontaktni ulashish» tugmasini bosing — bot raqamingizni tekshiradi.\n" +
        "2. Bot login va bir martalik parol yuboradi.\n" +
        "3. {siteUrl} saytiga kirib, o'z parolingizni belgilang.\n\n" +
        "Agar bot raqamingizni topa olmasa, shu chatning o'zida administratorga yozing.",
    },
  },
  {
    id: "never-logged-in",
    segment: "NEVER_LOGGED_IN",
    title: {
      ru: "Зарегистрировался, но не заходил на сайт",
      tg: "Сабти ном шуд, вале ба сайт надаромад",
      uz: "Ro'yxatdan o'tdi, lekin saytga kirmadi",
    },
    text: {
      ru:
        "Здравствуйте! Вы уже получили логин и пароль от бота, но ещё не заходили в кафетерий льгот.\n\n" +
        "Войдите на {siteUrl} с логином и одноразовым паролем из бота. Если пароль потерялся или устарел — отправьте боту команду /login, и он пришлёт новый.\n\n" +
        "Внутри — скидки и льготы от партнёров, которые можно выбрать в текущем периоде.",
      tg:
        "Салом! Шумо аллакай логин ва рамзро аз бот гирифтед, вале ба кафетерияи имтиёзҳо ворид нашудаед.\n\n" +
        "Ба {siteUrl} бо логин ва рамзи якдафъаинаи бот ворид шавед. Агар рамз гум шуда ё мӯҳлаташ гузашта бошад — ба бот фармони /login фиристед, рамзи нав меояд.\n\n" +
        "Дар дохил — тахфиф ва имтиёзҳои шарикон, ки дар давраи ҷорӣ интихоб кардан мумкин аст.",
      uz:
        "Assalomu alaykum! Siz botdan login va parolni oldingiz, lekin imtiyozlar kafeteriyasiga hali kirmadingiz.\n\n" +
        "{siteUrl} saytiga bot bergan login va bir martalik parol bilan kiring. Parol yo'qolgan yoki eskirgan bo'lsa — botga /login buyrug'ini yuboring, yangisini beradi.\n\n" +
        "Ichkarida — joriy davrda tanlash mumkin bo'lgan hamkorlarning chegirma va imtiyozlari.",
    },
  },
  {
    id: "no-choice",
    segment: "NO_CHOICE",
    title: {
      ru: "Заходил, но не выбрал льготу",
      tg: "Даромад, вале имтиёз интихоб накард",
      uz: "Kirdi, lekin imtiyoz tanlamadi",
    },
    text: {
      ru:
        "Здравствуйте! Вы заходили в кафетерий льгот, но пока не выбрали льготу в текущем периоде.\n\n" +
        "Окно выбора открыто до [дата]. Выбрать можно за пару минут: {siteUrl}\n\n" +
        "Не знаете, что выбрать? Нажмите «Автовыбор» — система предложит подходящие варианты.",
      tg:
        "Салом! Шумо ба кафетерияи имтиёзҳо ворид шудед, вале дар давраи ҷорӣ ҳанӯз имтиёз интихоб накардаед.\n\n" +
        "Тиреза барои интихоб то [сана] кушода аст. Интихоб чанд дақиқа мегирад: {siteUrl}\n\n" +
        "Намедонед чиро интихоб кунед? «Интихоби худкор»-ро пахш кунед — система вариантҳои мувофиқро пешниҳод мекунад.",
      uz:
        "Assalomu alaykum! Siz imtiyozlar kafeteriyasiga kirdingiz, lekin joriy davrda hali imtiyoz tanlamadingiz.\n\n" +
        "Tanlash oynasi [sana] gacha ochiq. Tanlash bir necha daqiqa oladi: {siteUrl}\n\n" +
        "Nimani tanlashni bilmayapsizmi? «Avtotanlov» tugmasini bosing — tizim mos variantlarni taklif qiladi.",
    },
  },
  {
    id: "window-open",
    segment: "ALL",
    title: {
      ru: "Открылось окно выбора нового периода",
      tg: "Тирезаи интихоби давраи нав кушода шуд",
      uz: "Yangi davr uchun tanlash oynasi ochildi",
    },
    text: {
      ru:
        "📅 Открыт выбор льгот на новый период.\n\n" +
        "Период: [название]\n" +
        "Выбрать льготы можно до [дата]: {siteUrl}\n\n" +
        "После окончания срока изменить выбор будет нельзя.",
      tg:
        "📅 Интихоби имтиёзҳо барои давраи нав кушода шуд.\n\n" +
        "Давра: [ном]\n" +
        "Имтиёзҳоро то [сана] интихоб кардан мумкин аст: {siteUrl}\n\n" +
        "Пас аз анҷоми мӯҳлат тағйир додани интихоб имконнопазир аст.",
      uz:
        "📅 Yangi davr uchun imtiyozlarni tanlash ochildi.\n\n" +
        "Davr: [nomi]\n" +
        "Imtiyozlarni [sana] gacha tanlash mumkin: {siteUrl}\n\n" +
        "Muddat tugagach, tanlovni o'zgartirib bo'lmaydi.",
    },
  },
  {
    id: "window-closing",
    segment: "NO_CHOICE",
    title: {
      ru: "Окно выбора скоро закроется",
      tg: "Тирезаи интихоб ба қарибӣ баста мешавад",
      uz: "Tanlash oynasi tez orada yopiladi",
    },
    text: {
      ru:
        "⏰ Напоминание: выбор льгот закрывается [дата, время].\n\n" +
        "Вы ещё не выбрали льготу. Успейте до конца срока: {siteUrl}",
      tg:
        "⏰ Ёдовар: интихоби имтиёзҳо [сана, вақт] баста мешавад.\n\n" +
        "Шумо ҳанӯз имтиёз интихоб накардаед. То анҷоми мӯҳлат ба даст оред: {siteUrl}",
      uz:
        "⏰ Eslatma: imtiyozlarni tanlash [sana, vaqt] da yopiladi.\n\n" +
        "Siz hali imtiyoz tanlamadingiz. Muddat tugaguncha ulguring: {siteUrl}",
    },
  },
  {
    id: "coupon-reminder",
    segment: "ALL",
    title: {
      ru: "Напоминание про купон",
      tg: "Ёдоварӣ дар бораи купон",
      uz: "Kupon haqida eslatma",
    },
    text: {
      ru:
        "🎟️ Напоминаем: ваш купон действует до [дата].\n\n" +
        "Предъявите его партнёру, чтобы получить скидку. Купон — в разделе «Мои заявки и купоны»: {siteUrl}/applications",
      tg:
        "🎟️ Ёдовар мешавем: купони шумо то [сана] амал мекунад.\n\n" +
        "Барои гирифтани тахфиф онро ба шарик нишон диҳед. Купон — дар бахши «Дархостҳо ва купонҳои ман»: {siteUrl}/applications",
      uz:
        "🎟️ Eslatamiz: kuponingiz [sana] gacha amal qiladi.\n\n" +
        "Chegirma olish uchun uni hamkorga ko'rsating. Kupon — «Mening arizalarim va kuponlarim» bo'limida: {siteUrl}/applications",
    },
  },
  {
    id: "new-benefit",
    segment: "ALL",
    title: {
      ru: "Новая льгота на витрине",
      tg: "Имтиёзи нав дар витрина",
      uz: "Vitrinada yangi imtiyoz",
    },
    text: {
      ru:
        "🆕 На витрине новая льгота: «[название]» — [партнёр].\n\n" +
        "[Кратко: условия и размер скидки]\n\n" +
        "Посмотреть и выбрать: {siteUrl}",
      tg:
        "🆕 Дар витрина имтиёзи нав: «[ном]» — [шарик].\n\n" +
        "[Мухтасар: шартҳо ва андозаи тахфиф]\n\n" +
        "Дидан ва интихоб: {siteUrl}",
      uz:
        "🆕 Vitrinada yangi imtiyoz: «[nomi]» — [hamkor].\n\n" +
        "[Qisqacha: shartlar va chegirma miqdori]\n\n" +
        "Ko'rish va tanlash: {siteUrl}",
    },
  },
  {
    id: "cashback",
    segment: "ALL",
    title: {
      ru: "Кешбек у партнёра",
      tg: "Кешбек назди шарик",
      uz: "Hamkordan keshbek",
    },
    text: {
      ru:
        "💳 Кешбек: [партнёр] возвращает [N]% с каждой покупки на ваш счёт у этого партнёра.\n\n" +
        "Накопленным кешбеком можно оплатить часть следующих покупок. При покупке покажите кассиру код из раздела «Мои заявки и купоны»: {siteUrl}/applications",
      tg:
        "💳 Кешбек: [шарик] [N]%-и ҳар харидро ба суратҳисоби шумо назди ҳамин шарик бармегардонад.\n\n" +
        "Бо кешбеки ҷамъшуда қисми харидҳои баъдиро пардохт кардан мумкин аст. Ҳангоми харид ба кассир рамзро аз бахши «Дархостҳо ва купонҳои ман» нишон диҳед: {siteUrl}/applications",
      uz:
        "💳 Keshbek: [hamkor] har bir xariddan [N]% ni shu hamkordagi hisobingizga qaytaradi.\n\n" +
        "To'plangan keshbek bilan keyingi xaridlarning bir qismini to'lash mumkin. Xarid paytida kassirga «Mening arizalarim va kuponlarim» bo'limidagi kodni ko'rsating: {siteUrl}/applications",
    },
  },
  {
    id: "maintenance",
    segment: "ALL",
    title: {
      ru: "Технический перерыв",
      tg: "Танаффуси техникӣ",
      uz: "Texnik tanaffus",
    },
    text: {
      ru:
        "🛠 Уважаемые коллеги! [дата] с [время] до [время] платформа будет недоступна из-за технических работ. " +
        "Приносим извинения за неудобства.",
      tg:
        "🛠 Ҳамкорони муҳтарам! [сана] аз [вақт] то [вақт] платформа бинобар корҳои техникӣ дастнорас мешавад. " +
        "Барои нороҳатӣ бахшиш металабем.",
      uz:
        "🛠 Hurmatli hamkasblar! [sana] kuni [vaqt] dan [vaqt] gacha platforma texnik ishlar tufayli mavjud bo'lmaydi. " +
        "Noqulaylik uchun uzr so'raymiz.",
    },
  },
  {
    id: "support",
    segment: "ALL",
    title: {
      ru: "Как связаться с поддержкой",
      tg: "Чӣ тавр бо дастгирӣ тамос гирифтан",
      uz: "Qo'llab-quvvatlash bilan bog'lanish",
    },
    text: {
      ru:
        "💬 Есть вопрос по льготам или не получается войти? Напишите администратору прямо в боте: {botUrl}\n\n" +
        "Мы ответим в рабочее время.",
      tg:
        "💬 Дар бораи имтиёзҳо савол доред ё ворид шуда наметавонед? Ба маъмур мустақиман дар бот нависед: {botUrl}\n\n" +
        "Мо дар вақти корӣ ҷавоб медиҳем.",
      uz:
        "💬 Imtiyozlar bo'yicha savolingiz bormi yoki kira olmayapsizmi? Administratorga to'g'ridan-to'g'ri botda yozing: {botUrl}\n\n" +
        "Ish vaqtida javob beramiz.",
    },
  },
];
