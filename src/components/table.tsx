"use client";

import { Children, cloneElement, isValidElement, useMemo, useState, type ReactNode, type ReactElement, type HTMLAttributes } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEl = ReactElement<any>;

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Текст ячейки — рекурсивно по детям, вплоть до опорных элементов (Badge, span и т.п.). */
function nodeText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join(" ");
  if (isValidElement(node)) return nodeText((node.props as { children?: ReactNode }).children);
  return "";
}

// Русские даты в таблицах (17.09.2026[, 14:05]) — без этого сортировались бы
// как текст (не по времени). Числа/«#seq»-чипы/проценты — тоже по значению.
const RU_DATE = /^(\d{2})\.(\d{2})\.(\d{4})(?:,?\s+(\d{2}):(\d{2}))?/;

function sortKey(text: string): string | number {
  const t = text.trim();
  if (!t) return "";
  const m = RU_DATE.exec(t);
  if (m) {
    const [, d, mo, y, h = "00", mi = "00"] = m;
    return Date.UTC(+y, +mo - 1, +d, +h, +mi);
  }
  const cleaned = t.replace(/^#/, "").replace(/[\s,]/g, "").replace(/%$/, "");
  if (cleaned && !Number.isNaN(Number(cleaned))) return Number(cleaned);
  return t.toLowerCase();
}

const collator = new Intl.Collator("ru", { numeric: true, sensitivity: "base" });

function compareKeys(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return collator.compare(String(a), String(b));
}

function SortIcon({ dir }: { dir: 1 | -1 | 0 }) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx("shrink-0 transition-opacity", dir === 0 && "opacity-30")}
      aria-hidden="true"
    >
      {dir === -1 ? <path d="M6 9l6 6 6-6" /> : <path d="M6 15l6-6 6 6" />}
    </svg>
  );
}

/**
 * Таблица на дизайн-токенах с горизонтальным скроллом на узких экранах.
 * `stickyHeader` — прокручиваемое тело с закреплённой шапкой (высота ограничена).
 *
 * Сортировка по клику на заголовок колонки — встроена сюда же, а не в
 * каждую страницу: `<thead><tr><th>…</th></tr></thead>` и
 * `<tbody>{rows.map(...)}</tbody>` оборачиваются как есть, без изменений на
 * стороне вызывающего кода. Строка исключается из сортировки (остаётся в
 * конце как есть), если она не `<tr>` (нестандартный компонент строки),
 * число ячеек не совпадает с числом заголовков (напр. строка «нет данных»
 * с `colSpan`), содержит ячейку с `colSpan`, или сама помечена `data-pin`
 * (напр. строка «Итого»).
 */
export function Table({
  className,
  stickyHeader,
  children,
  ...props
}: HTMLAttributes<HTMLTableElement> & { children: ReactNode; stickyHeader?: boolean }) {
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);

  const top = Children.toArray(children) as AnyEl[];
  const theadEl = top.find((c) => c.type === "thead");
  const tbodyEl = top.find((c) => c.type === "tbody");
  const rest = top.filter((c) => c !== theadEl && c !== tbodyEl);

  const headerRow = theadEl
    ? (Children.toArray((theadEl.props as { children?: ReactNode }).children) as AnyEl[]).find(
        (c) => c.type === "tr",
      )
    : undefined;
  const headerCells = useMemo(
    () => (headerRow ? (Children.toArray((headerRow.props as { children?: ReactNode }).children) as AnyEl[]) : []),
    [headerRow],
  );

  const sortedThead = useMemo(() => {
    if (!theadEl || !headerRow) return theadEl;
    const newCells = headerCells.map((th, i) => {
      if (th.type !== "th") return th;
      const active = sort?.col === i;
      return cloneElement(th, {
        key: th.key ?? i,
        onClick: () =>
          setSort((s) => (s?.col === i ? (s.dir === 1 ? { col: i, dir: -1 } : null) : { col: i, dir: 1 })),
        "aria-sort": active ? (sort!.dir === 1 ? "ascending" : "descending") : undefined,
        className: cx((th.props as { className?: string }).className, "cursor-pointer select-none hover:text-ink"),
        children: (
          <span className="inline-flex items-center gap-1">
            {(th.props as { children?: ReactNode }).children}
            <SortIcon dir={active ? sort!.dir : 0} />
          </span>
        ),
      });
    });
    return cloneElement(theadEl, { children: cloneElement(headerRow, { children: newCells }) });
  }, [theadEl, headerRow, headerCells, sort]);

  const sortedTbody = useMemo(() => {
    if (!tbodyEl) return tbodyEl;
    if (!sort || headerCells.length === 0) return tbodyEl;
    const rows = Children.toArray((tbodyEl.props as { children?: ReactNode }).children) as AnyEl[];
    const sortable: { row: AnyEl; key: string | number }[] = [];
    const pinned: AnyEl[] = [];
    for (const row of rows) {
      const cells =
        row.type === "tr" ? (Children.toArray((row.props as { children?: ReactNode }).children) as AnyEl[]) : [];
      const hasColSpan = cells.some((c) => (c.props as { colSpan?: number }).colSpan);
      if (row.type !== "tr" || cells.length !== headerCells.length || hasColSpan || (row.props as { "data-pin"?: unknown })["data-pin"]) {
        pinned.push(row);
        continue;
      }
      sortable.push({ row, key: sortKey(nodeText(cells[sort.col])) });
    }
    sortable.sort((a, b) => compareKeys(a.key, b.key) * sort.dir);
    return cloneElement(tbodyEl, { children: [...sortable.map((s) => s.row), ...pinned] });
  }, [tbodyEl, sort, headerCells]);

  return (
    <div
      className={cx(
        "w-full",
        stickyHeader ? "max-h-[calc(100dvh-13rem)] overflow-auto" : "overflow-x-auto",
      )}
    >
      <table
        className={cx(
          "w-full border-collapse text-sm [&_thead]:bg-surface-muted " +
            "[&_th]:px-3 [&_th]:py-2.5 [&_th]:text-left [&_th]:text-xs [&_th]:font-bold " +
            "[&_th]:uppercase [&_th]:tracking-[0.06em] [&_th]:text-ink-muted " +
            "[&_td]:px-3 [&_td]:py-2 [&_td]:border-t [&_td]:border-line-subtle " +
            "[&_tbody_tr:hover]:bg-surface-muted",
          stickyHeader &&
            "[&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-surface-muted " +
              "[&_thead_th]:shadow-[inset_0_-1px_0_var(--line)]",
          className,
        )}
        {...props}
      >
        {sortedThead}
        {sortedTbody}
        {rest}
      </table>
    </div>
  );
}
