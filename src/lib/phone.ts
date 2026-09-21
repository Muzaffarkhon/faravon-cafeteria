/**
 * Канонизируем номер к 9-значному национальному (Таджикистан): только цифры,
 * отбрасываем код страны 992 и ведущий 0, берём последние 9. Так совпадают
 * «+992 92 630 94 49», «992926309449» (из Telegram-контакта) и «926309449».
 *
 * Значение сохраняется в `Employee.phoneNormalized` (индекс) — для быстрого
 * поиска сотрудника при входе через Telegram, без загрузки всего справочника.
 * Та же логика продублирована в SQL миграции 20260903140000 (бэкофилл).
 */
export function normalizePhone(raw: string): string {
  let d = String(raw).replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("992")) d = d.slice(3);
  if (d.length === 10 && d.startsWith("0")) d = d.slice(1);
  return d.length > 9 ? d.slice(-9) : d;
}

/**
 * Форматирует номер к виду +992XXXXXXXXX, если он содержит 9 цифр национального номера.
 */
export function formatTajikPhone(raw: string): string | null {
  const norm = normalizePhone(raw);
  return norm.length === 9 ? `+992${norm}` : null;
}

/**
 * Номер из Telegram-контакта всегда приходит с кодом страны. Доверяем только таджикскому
 * (+992 и 9 цифр национального номера, всего 12 цифр). `normalizePhone` отбрасывает код
 * страны и берёт последние 9 цифр, поэтому без этой проверки номер другой страны с теми же
 * 9 цифрами (например, +998 92 630 94 49 и +992 92 630 94 49) считался бы тем же сотрудником,
 * и бот выдал бы доступ к его учётной записи.
 */
export function isTajikInternational(raw: string): boolean {
  const d = String(raw ?? "").replace(/\D/g, "");
  return d.length === 12 && d.startsWith("992");
}

/**
 * Ищет в свободном тексте похожее на номер телефона (гость мог написать его
 * просто текстом в чат, а не поделиться контактом — тогда `SupportThread.phone`
 * остаётся пустым). Сначала пробует всю строку целиком, затем — самую длинную
 * цифровую подстроку в ней.
 */
export function extractPhoneFromText(text: string): string | null {
  const whole = formatTajikPhone(text);
  if (whole) return whole;
  const digitRuns = text.match(/\d[\d\s().-]{7,}\d/g) ?? [];
  for (const run of digitRuns) {
    const formatted = formatTajikPhone(run);
    if (formatted) return formatted;
  }
  return null;
}

/**
 * Разбирает строку, которая может содержать один или несколько номеров
 * (через запятую, слэш, точку с запятой), и возвращает очищенные уникальные номера.
 */
export function parsePhoneNumbers(raw: string): string[] {
  if (!raw) return [];
  const parts = String(raw).split(/[,;/|\n]+/);
  const result: string[] = [];
  for (const part of parts) {
    const formatted = formatTajikPhone(part);
    if (formatted && !result.includes(formatted)) {
      result.push(formatted);
    }
  }
  return result;
}

