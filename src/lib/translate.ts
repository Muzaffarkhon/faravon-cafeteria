/**
 * Автоперевод ru → tg/uz через неофициальный (без ключа) эндпоинт Google
 * Translate. Не SLA-гарантированный сервис — используется как черновик,
 * который сотрудник C&B правит руками в форме перед сохранением.
 */

const ENDPOINT = "https://translate.googleapis.com/translate_a/single";

async function translateOne(text: string, target: "tg" | "uz"): Promise<string> {
  if (!text.trim()) return "";
  const url = `${ENDPOINT}?client=gtx&sl=ru&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Переводчик недоступен (${res.status})`);
  const data = (await res.json()) as unknown;
  const segments = Array.isArray(data) ? data[0] : null;
  if (!Array.isArray(segments)) throw new Error("Неожиданный ответ переводчика");
  return segments.map((seg) => (Array.isArray(seg) ? String(seg[0] ?? "") : "")).join("");
}

/** Переводит список строк на оба языка витрины. Порядок сохраняется. */
export async function translateBatch(
  texts: string[],
): Promise<{ tg: string[]; uz: string[] }> {
  const [tg, uz] = await Promise.all([
    Promise.all(texts.map((t) => translateOne(t, "tg"))),
    Promise.all(texts.map((t) => translateOne(t, "uz"))),
  ]);
  return { tg, uz };
}
