/**
 * Тексты уведомлений бота на таджикском и узбекском (русские — в DEFAULT_TEMPLATES).
 * Синтаксис тот же: {значение}, [[ необязательный блок ]], теги <b>/<code>.
 * Термины согласованы со словарём сайта (src/lib/i18n/dict.ts). Переводы машинного уровня —
 * перед запуском их стоит показать носителям языка; правятся в админке «Уведомления».
 * Без server-only: используется и веб-приложением, и ботом.
 */
import type { Locale } from "./i18n/shared";

export type TranslatedLocale = Exclude<Locale, "ru">;

export const DEFAULT_TEMPLATES_I18N: Record<TranslatedLocale, Record<string, string>> = {
  tg: {
    APPLICATION_SUBMITTED:
      "🆕 <b>Дархости нав барои тасдиқ</b>\n{employee}[[ · {department}]] — {count} {countNoun}[[\nДавра: {period}]]\n\nБахши «Тасдиқ»-ро кушоед.",
    ITEM_APPROVED:
      "✅ <b>Мавқеъ тасдиқ шуд</b>\n«{card}»[[ · {period}]][[\n\nИн имтиёзи {group} аст — купон пас аз ҷамъ шудани шумораи лозимии иштирокчиён меояд. Пешрафти ҷамъшавӣ дар бахши «Дархостҳои ман» намоён аст.]]",
    ITEM_REJECTED: "❌ <b>Мавқеъ рад шуд</b>\n«{card}»[[ · {period}]][[\nСабаб: {comment}]]",
    COUPON_ISSUED:
      "🎟️ <b>Купон омода аст</b>\n«{card}»[[ · {period}]][[\n№ <code>{number}</code>]][[\nАз {validFrom} то {validUntil} амал мекунад]]\n\nОнро ба шарик нишон диҳед.[[\n\nМуфассалтар — дар бахши «Дархостҳо ва купонҳои ман»: {siteUrl}/applications]]",
    SLA_ESCALATION:
      "⏰ <b>Дархост мунтазири қарор аст</b>\n{employee}[[ · {department}]] — «{card}»\nЗиёда аз {hours} соат гузашт (сатҳ {level})\n\nБахши «Тасдиқ»-ро кушоед.",
    COUPON_CONFIRMED_BY_PROVIDER: "🤝 <b>Купон назди шарик фаъол карда шуд</b>\n«{card}»[[ · {period}]][[\n№ <code>{number}</code>]]",
    WINDOW_OPEN: "🗓️ <b>Тирезаи интихоби имтиёзҳо кушода шуд</b>[[\nДавра: {period}]]\nИмтиёзҳоро то {windowEnd} интихоб кунед.",
    WINDOW_CLOSING:
      "⏳ <b>Тирезаи интихоб ба қарибӣ баста мешавад</b>[[\nДавра: {period}]]\n{windowEnd} баста мешавад, вале шумо ҳанӯз имтиёз интихоб накардаед. Интихобро ба анҷом расонед.",
    TAXI_REQUEST_APPROVED:
      "🚕 <b>Дархост барои сафарҳо тасдиқ шуд</b>\n{employee}[[ · «{card}»]][[ · {period}]]\nТелефон: <code>{phone}</code>\n\nПромокодро дар системаи худ сабт кунед ва тавассути бахши «Промокодҳо» ба кормандон фиристед.",
    TAXI_APPROVED_EMPLOYEE:
      "✅ <b>Сафар тасдиқ шуд</b>\n«{card}»[[ · {period}]]\nПромокод барои сафар аз тарафи шарик ба ҳамин чат меояд.",
    TAXI_PROMO_CODE:
      "🎟️ <b>Промокод барои сафар</b>[[\n«{card}»]][[ · {period}]]\n<code>{promo}</code>[[\n\nМуфассалтар — дар бахши «Дархостҳо ва купонҳои ман»: {siteUrl}/applications]]",
    DAILY_DIGEST: "📊 <b>Ҳисобот дар оғози рӯз</b>\n{text}",
    GROUP_CARRIED_OVER:
      "🔁 <b>Имтиёзи гурӯҳӣ ба давраи оянда гузаронида шуд</b>\n«{card}» шумораи лозимии иштирокчиёнро ҷамъ накард[[\nДавра: {period}]]\nИнтихоби шумо ба давраи оянда гузаронида шуд — онро дар тирезаи интихоби ин давра, то оғози он, бекор кардан мумкин аст.",
    BROADCAST: "📢 <b>Эълон</b>\n{text}",
    CASHBACK_OPERATION:
      "💳 <b>Харид бо кешбэк</b>\n{partner} — чеки {purchase} сом.[[\nАз кешбэк тоза шуд: {redeemed} сом.]][[\nКешбэк ҳисоб шуд: {accrued} сом.]]\nМонда назди шарик: {balance} сом.\n\nАгар ин шумо набудед — ба дастгирӣ хабар диҳед.",
    CASHBACK_REVERSED:
      "↩️ <b>Амалиёти кешбэк бекор карда шуд</b>\n{partner}[[\nСабаб: {reason}]]\nМонда назди шарик: {balance} сом.",
    NEW_CARD: "🆕 <b>Имтиёзи нав</b>\n«{card}»[[ · {partner}]][[\n{condition}]]\n\nДидан ва интихоб — дар витрина: {siteUrl}",
  },
  uz: {
    APPLICATION_SUBMITTED:
      "🆕 <b>Tasdiqlash uchun yangi ariza</b>\n{employee}[[ · {department}]] — {count} {countNoun}[[\nDavr: {period}]]\n\n«Tasdiqlash» bo'limini oching.",
    ITEM_APPROVED:
      "✅ <b>Pozitsiya tasdiqlandi</b>\n«{card}»[[ · {period}]][[\n\nBu {group} imtiyoz — kupon kerakli miqdordagi ishtirokchilar yig'ilgach keladi. Yig'ilish jarayoni «Mening arizalarim» bo'limida ko'rinadi.]]",
    ITEM_REJECTED: "❌ <b>Pozitsiya rad etildi</b>\n«{card}»[[ · {period}]][[\nSabab: {comment}]]",
    COUPON_ISSUED:
      "🎟️ <b>Kupon tayyor</b>\n«{card}»[[ · {period}]][[\n№ <code>{number}</code>]][[\n{validFrom} dan {validUntil} gacha amal qiladi]]\n\nUni hamkorga ko'rsating.[[\n\nBatafsil — «Mening arizalarim va kuponlarim» bo'limida: {siteUrl}/applications]]",
    SLA_ESCALATION:
      "⏰ <b>Ariza qarorni kutmoqda</b>\n{employee}[[ · {department}]] — «{card}»\n{hours} soatdan ko'proq vaqt o'tdi (daraja {level})\n\n«Tasdiqlash» bo'limini oching.",
    COUPON_CONFIRMED_BY_PROVIDER: "🤝 <b>Kupon hamkorda faollashtirildi</b>\n«{card}»[[ · {period}]][[\n№ <code>{number}</code>]]",
    WINDOW_OPEN: "🗓️ <b>Imtiyozlarni tanlash oynasi ochildi</b>[[\nDavr: {period}]]\nImtiyozlarni {windowEnd} gacha tanlang.",
    WINDOW_CLOSING:
      "⏳ <b>Tanlash oynasi tez orada yopiladi</b>[[\nDavr: {period}]]\n{windowEnd} da yopiladi, siz esa hali imtiyoz tanlamadingiz. Tanlovni rasmiylashtirishga ulguring.",
    TAXI_REQUEST_APPROVED:
      "🚕 <b>Safarlar uchun ariza tasdiqlandi</b>\n{employee}[[ · «{card}»]][[ · {period}]]\nTelefon: <code>{phone}</code>\n\nPromokodni o'z tizimingizda yarating va «Promokodlar» bo'limi orqali xodimlarga yuboring.",
    TAXI_APPROVED_EMPLOYEE:
      "✅ <b>Safar tasdiqlandi</b>\n«{card}»[[ · {period}]]\nSafar uchun promokod hamkor tomonidan shu chatga keladi.",
    TAXI_PROMO_CODE:
      "🎟️ <b>Safar uchun promokod</b>[[\n«{card}»]][[ · {period}]]\n<code>{promo}</code>[[\n\nBatafsil — «Mening arizalarim va kuponlarim» bo'limida: {siteUrl}/applications]]",
    DAILY_DIGEST: "📊 <b>Kun boshidagi hisobot</b>\n{text}",
    GROUP_CARRIED_OVER:
      "🔁 <b>Guruhli imtiyoz keyingi davrga ko'chirildi</b>\n«{card}» kerakli miqdordagi ishtirokchini yig'a olmadi[[\nDavr: {period}]]\nTanlovingiz keyingi davrga ko'chirildi — uni shu davrning tanlash oynasida, boshlanishigacha bekor qilish mumkin.",
    BROADCAST: "📢 <b>E'lon</b>\n{text}",
    CASHBACK_OPERATION:
      "💳 <b>Keshbek bilan xarid</b>\n{partner} — chek {purchase} som.[[\nKeshbekdan yechildi: {redeemed} som.]][[\nKeshbek hisoblandi: {accrued} som.]]\nHamkordagi qoldiq: {balance} som.\n\nAgar bu siz bo'lmasangiz — qo'llab-quvvatlashga xabar bering.",
    CASHBACK_REVERSED:
      "↩️ <b>Keshbek amaliyoti bekor qilindi</b>\n{partner}[[\nSabab: {reason}]]\nHamkordagi qoldiq: {balance} som.",
    NEW_CARD: "🆕 <b>Yangi imtiyoz</b>\n«{card}»[[ · {partner}]][[\n{condition}]]\n\nKo'rish va tanlash — vitrinada: {siteUrl}",
  },
};

/** «позиция» в счётной конструкции: в tg/uz после числа слово не склоняется. */
export const COUNT_NOUN: Record<TranslatedLocale, string> = { tg: "мавқеъ", uz: "pozitsiya" };

/** Слово «групповая» для подстановки {group}: из payload приходит русское. */
export const GROUP_WORD: Record<TranslatedLocale, string> = { tg: "гурӯҳӣ", uz: "guruhli" };
