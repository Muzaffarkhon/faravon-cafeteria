/** Сегменты рассылки — без серверного кода, чтобы использовать и в форме, и на сервере. */
export const SEGMENTS = ["ALL", "NOT_REGISTERED", "NEVER_LOGGED_IN", "NO_CHOICE", "BY_CARD", "UNREDEEMED_COUPON", "BY_CAMPAIGN"] as const;
export type Segment = (typeof SEGMENTS)[number];

export const SEGMENT_LABELS: Record<Segment, string> = {
  ALL: "Все сотрудники",
  NOT_REGISTERED: "Нажали «Старт» в боте, но не зарегистрировались",
  NEVER_LOGGED_IN: "Зарегистрировались, но ни разу не заходили",
  NO_CHOICE: "Заходили, но пока не выбрали льготу в текущем периоде",
  BY_CARD: "Выбравшие определённую льготу",
  UNREDEEMED_COUPON: "Есть купон, который ещё не погашен",
  BY_CAMPAIGN: "По ответу на рассылку с подтверждением",
};

/** Кому из выбравших льготу писать (сегмент BY_CARD). */
export const CARD_AUDIENCES = ["BOTH", "SELECTED", "ISSUED"] as const;
export type CardAudience = (typeof CARD_AUDIENCES)[number];
export const CARD_AUDIENCE_LABELS: Record<CardAudience, string> = {
  BOTH: "Выбрали или уже получили купон",
  SELECTED: "Выбрали, купон ещё не выдан",
  ISSUED: "Получили купон",
};

/** Кому из получателей прошлой рассылки писать (сегмент BY_CAMPAIGN). */
export const CAMPAIGN_ANSWERS = ["YES", "NO", "NONE", "ANSWERED", "ALL"] as const;
export type CampaignAnswer = (typeof CAMPAIGN_ANSWERS)[number];
export const CAMPAIGN_ANSWER_LABELS: Record<CampaignAnswer, string> = {
  YES: "Ответили «Да»",
  NO: "Ответили «Нет»",
  NONE: "Не ответили",
  ANSWERED: "Ответили (любой ответ)",
  ALL: "Все получатели",
};
