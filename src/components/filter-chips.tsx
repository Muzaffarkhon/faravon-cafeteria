import Link from "next/link";
import { cx } from "./ui";

export type ChipGroup = {
  /** Имя параметра в адресе страницы. */
  param: string;
  /** Подпись группы слева от чипов. */
  label: string;
  options: { value: string; label: string }[];
};

/**
 * Быстрые фильтры над реестром. Каждый чип — обычная ссылка, которая правит
 * один параметр адреса: фильтр переживает перезагрузку, его можно переслать
 * ссылкой, и странице не нужен клиентский JS. Повторный клик по активному
 * чипу снимает фильтр, `page` всегда сбрасывается на первую.
 *
 * Формы с кнопкой «Показать» на тех же страницах отправляют только свои поля,
 * поэтому параметры чипов надо продублировать в них скрытыми input —
 * см. `hiddenChipInputs`.
 */
export function FilterChips({
  basePath,
  params,
  groups,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  groups: ChipGroup[];
}) {
  const href = (param: string, value: string | null) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v && k !== "page" && k !== param) p.set(k, v);
    }
    if (value) p.set(param, value);
    const qs = p.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const active = groups.filter((g) => params[g.param]);
  const clearHref = () => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v && k !== "page" && !groups.some((g) => g.param === k)) p.set(k, v);
    }
    const qs = p.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {groups.map((g) => (
        <div key={g.param} className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
            {g.label}
          </span>
          {g.options.map((o) => {
            const on = params[g.param] === o.value;
            return (
              <Link
                key={o.value}
                href={href(g.param, on ? null : o.value)}
                aria-pressed={on}
                className={cx(
                  "rounded-full border px-2.5 py-1 text-xs font-semibold transition",
                  on
                    ? "border-transparent bg-primary text-on-brand"
                    : "border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink",
                )}
              >
                {o.label}
              </Link>
            );
          })}
        </div>
      ))}
      {active.length > 0 && (
        <Link
          href={clearHref()}
          className="text-xs text-ink-muted hover:text-ink hover:underline"
        >
          снять фильтры
        </Link>
      )}
    </div>
  );
}

/**
 * Скрытые поля с текущими значениями чипов — чтобы соседняя GET-форма
 * («Найти», «Показать») не стирала их при отправке.
 */
export function hiddenChipInputs(
  params: Record<string, string | undefined>,
  names: string[],
) {
  return names
    .filter((n) => params[n])
    .map((n) => <input key={n} type="hidden" name={n} value={params[n]} />);
}
