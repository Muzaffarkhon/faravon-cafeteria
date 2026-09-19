/** Сегменты рассылки — без серверного кода, чтобы использовать и в форме, и на сервере. */
export const SEGMENTS = ["ALL", "NOT_REGISTERED", "NEVER_LOGGED_IN", "NO_CHOICE"] as const;
export type Segment = (typeof SEGMENTS)[number];

export const SEGMENT_LABELS: Record<Segment, string> = {
  ALL: "Все сотрудники",
  NOT_REGISTERED: "Нажали «Старт» в боте, но не зарегистрировались",
  NEVER_LOGGED_IN: "Зарегистрировались, но ни разу не заходили",
  NO_CHOICE: "Заходили, но пока не выбрали льготу в текущем периоде",
};
