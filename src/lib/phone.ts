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

