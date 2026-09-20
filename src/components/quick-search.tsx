import { Input, buttonClass } from "./ui";
import { hiddenChipInputs } from "./filter-chips";

/**
 * Единственная видимая строка поиска над таблицей — ищет по всем основным
 * текстовым колонкам сразу (через `q`), без открытия модалки умного
 * фильтра. Обычная GET-форма: работает без клиентского JS, сохраняет
 * активные условия умного фильтра (`sf_*`) и любые прочие параметры адреса
 * при отправке.
 */
export function QuickSearch({
  basePath,
  sp,
  placeholder,
  preserveKeys = [],
}: {
  basePath: string;
  sp: Record<string, string | undefined>;
  placeholder: string;
  preserveKeys?: string[];
}) {
  const preserve = [...preserveKeys, ...Object.keys(sp).filter((k) => k.startsWith("sf_"))];
  // На телефоне форма занимает всю доступную ширину и сжимается (min-w-0), а не выдавливает страницу шире экрана.
  return (
    <form method="get" action={basePath} className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
      {hiddenChipInputs(sp, preserve)}
      <Input name="q" defaultValue={sp.q ?? ""} placeholder={placeholder} className="min-w-0 flex-1 py-1.5 text-sm sm:w-64 sm:flex-none" />
      <button className={buttonClass({ variant: "secondary", size: "sm" }) + " shrink-0"}>Найти</button>
    </form>
  );
}
