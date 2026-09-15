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
  return (
    <form method="get" action={basePath} className="flex items-center gap-2">
      {hiddenChipInputs(sp, preserve)}
      <Input name="q" defaultValue={sp.q ?? ""} placeholder={placeholder} className="w-64 py-1.5 text-sm" />
      <button className={buttonClass({ variant: "secondary", size: "sm" })}>Найти</button>
    </form>
  );
}
