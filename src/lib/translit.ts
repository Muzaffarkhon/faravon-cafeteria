/**
 * Транслитерация кириллицы и таджикских букв в латиницу — для автогенерации
 * логина из ФИО. Без server-only: используется и на клиенте (форма), и на сервере.
 */
const MAP: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh",
  щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  // таджикские
  ғ: "gh", ӣ: "i", қ: "q", ӯ: "u", ҳ: "h", ҷ: "j",
};

/** Строка → безопасный latin-slug (a-z0-9._-). */
export function translit(input: string): string {
  return input
    .toLowerCase()
    .split("")
    .map((ch) => (ch in MAP ? MAP[ch] : ch))
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Логин из ФИО: «Фамилия Имя Отчество» → «familiya.i».
 * Если частей меньше двух — просто транслит целиком.
 */
export function loginFromFullName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const surname = translit(parts[0]).replace(/-/g, "");
  if (parts.length === 1) return surname;
  const initial = translit(parts[1]).replace(/-/g, "").slice(0, 1);
  return initial ? `${surname}.${initial}` : surname;
}

/**
 * Логин из названия партнёра: «Столовая Фаровон» → «partner_stolovaya_farovon».
 */
export function loginFromPartnerName(name: string): string {
  const clean = name.replace(/^(ооо|зао|оао|ип|чп|тоо|llc|cjsc|ojsc)\s+/i, "");
  const slug = translit(clean).replace(/[^a-z0-9]+/g, "_").slice(0, 24).replace(/^_+|_+$/g, "");
  return slug ? `partner_${slug}` : "partner";
}

/**
 * Гарантирует уникальный логин: если «ivanov.i» уже занят, пробует «ivanov.i2», «ivanov.i3» и т.д.
 * Автоматически добавляет выданный логин в takenLogins для защиты от коллизий в рамках одного батча.
 */
export function generateUniqueLogin(
  baseLogin: string,
  takenLogins: Set<string>,
): string {
  let candidate = baseLogin.toLowerCase().replace(/[^a-z0-9._-]/g, "") || "user";
  if (candidate.length < 3) candidate = candidate.padEnd(3, "0");
  if (!takenLogins.has(candidate)) {
    takenLogins.add(candidate);
    return candidate;
  }
  let counter = 2;
  while (takenLogins.has(`${candidate}${counter}`)) {
    counter++;
  }
  const result = `${candidate}${counter}`;
  takenLogins.add(result);
  return result;
}
