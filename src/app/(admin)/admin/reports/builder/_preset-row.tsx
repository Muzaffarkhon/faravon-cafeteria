"use client";

import { useRef } from "react";
import { deleteReportPreset, setReportSchedule, updateReportPreset } from "./actions";
import { cx } from "@/components/ui";

const WEEKDAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

/** Один сохранённый срез: ссылка, пометка «общий», рассылка в Telegram, (для автора) общий доступ / переименование / удаление. */
export function PresetRow({
  id,
  name,
  href,
  shared,
  mine,
  author,
  schedule,
}: {
  id: string;
  name: string;
  href: string;
  shared: boolean;
  mine: boolean;
  author: string;
  schedule: number | null;
}) {
  const scheduleForm = useRef<HTMLFormElement>(null);
  const renameForm = useRef<HTMLFormElement>(null);
  const renameInput = useRef<HTMLInputElement>(null);

  return (
    <div className="flex items-center gap-1.5 rounded-full border border-line bg-surface py-0.5 pl-3 pr-1 text-xs">
      {/* Обычная ссылка, не next/link: нужен полный переход — клиентские редакторы пересоздаются с новым initial-состоянием. */}
      <a href={href} className="font-semibold text-ink hover:underline" title={mine ? undefined : `Автор: ${author}`}>
        {name}
      </a>
      {shared && <span className="rounded-full bg-primary-soft px-1.5 text-[10px] font-semibold text-primary-strong">{mine ? "общий" : author}</span>}

      <form ref={scheduleForm} action={setReportSchedule}>
        <input type="hidden" name="presetId" value={id} />
        <select
          name="schedule"
          defaultValue={schedule == null ? "" : String(schedule)}
          onChange={() => scheduleForm.current?.requestSubmit()}
          aria-label="Рассылка в Telegram"
          title="Присылать этот отчёт в Telegram в ~09:00 по Душанбе"
          className={cx("rounded-full border border-line-subtle bg-transparent px-1.5 py-0.5 text-[11px]", schedule != null ? "text-primary-strong" : "text-ink-subtle")}
        >
          <option value="">✉ нет</option>
          <option value="0">✉ каждый день</option>
          {WEEKDAYS.map((d, i) => (
            <option key={d} value={i + 1}>
              ✉ по {d}
            </option>
          ))}
        </select>
      </form>

      {mine && (
        <>
          <form action={updateReportPreset}>
            <input type="hidden" name="presetId" value={id} />
            <input type="hidden" name="sharedFlag" value={shared ? "0" : "1"} />
            <button className="rounded-full px-1.5 py-0.5 text-[11px] text-ink-subtle hover:bg-surface-muted" title={shared ? "Сделать личным" : "Показать коллегам"}>
              {shared ? "🔓" : "🔒"}
            </button>
          </form>
          <form ref={renameForm} action={updateReportPreset}>
            <input type="hidden" name="presetId" value={id} />
            <input ref={renameInput} type="hidden" name="presetName" />
            <button
              type="button"
              aria-label={`Переименовать «${name}»`}
              onClick={() => {
                const next = window.prompt("Новое название среза", name);
                if (next && next.trim() && renameInput.current) {
                  renameInput.current.value = next.trim();
                  renameForm.current?.requestSubmit();
                }
              }}
              className="rounded-full px-1.5 py-0.5 text-[11px] text-ink-subtle hover:bg-surface-muted"
            >
              ✎
            </button>
          </form>
          <form
            action={deleteReportPreset}
            onSubmit={(e) => {
              if (!window.confirm(`Удалить срез «${name}»?`)) e.preventDefault();
            }}
          >
            <input type="hidden" name="presetId" value={id} />
            <button aria-label={`Удалить срез «${name}»`} className="rounded-full px-1.5 py-0.5 text-[11px] text-ink-subtle hover:bg-danger-soft hover:text-danger">
              ×
            </button>
          </form>
        </>
      )}
    </div>
  );
}
