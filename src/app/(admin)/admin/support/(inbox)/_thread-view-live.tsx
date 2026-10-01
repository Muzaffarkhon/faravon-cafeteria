"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import { ThreadView, type Msg, type QuickReply } from "./[id]/_thread-view";
import { markThreadRead, type EmployeeMatch } from "../actions";
import { SUPPORT_READ_EVENT } from "@/app/(app)/_support-alert";

const POLL_MS = 4_000;

type ThreadData = {
  threadId: string;
  status: "OPEN" | "CLOSED";
  source: "TELEGRAM" | "WEB";
  archived: boolean;
  /** Отпечаток диалога (сообщения/статус) — сверяется лёгким опросом. */
  version: string;
  unread: boolean;
  messages: Msg[];
  quickReplies: QuickReply[];
  identityTitle: string;
  identitySubtitle: string;
  guestPhone: string | null;
  guestNameGuess: string | null;
  alreadyLinked: boolean;
  initialMatches: EmployeeMatch[];
};

/**
 * Правая панель диалога — сама опрашивает `/api/support/thread/<id>` вместо
 * серверного рендера страницы. Какой диалог показывать, ей сообщает
 * `SupportInboxClient` через `activeId` — обычным React-пропом, а не через
 * `usePathname()`: переключение между чатами идёт мимо роутера Next.js
 * (см. комментарий в `_support-inbox-client.tsx`), поэтому ничего в
 * раскладке не «перезагружается» — меняется только содержимое этой панели,
 * как в мессенджере.
 *
 * Пока диалог открыт и вкладка видна, раз в POLL_MS спрашиваем у сервера только
 * «отпечаток» диалога (?light=1) и перечитываем его целиком, лишь когда он
 * изменился, — новое сообщение появляется само, без обновления страницы.
 *
 * Уже открытые в этой сессии диалоги кэшируются в памяти и показываются
 * мгновенно при повторном клике; для остальных остаётся виден предыдущий
 * диалог, пока не подгрузится новый — экран никогда не становится пустым.
 */
export function ThreadViewLive({
  locale,
  activeId,
  backHref,
  onBack,
  onListChanged,
}: {
  locale: Locale;
  activeId: string | undefined;
  backHref: string;
  onBack: () => void;
  /** Вызывается после действий, меняющих список (ответ/закрытие/архив/удаление) — список обновляется сразу, не дожидаясь опроса. */
  onListChanged?: () => void;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  const cacheRef = useRef<Map<string, ThreadData>>(new Map());
  const fetchSeqRef = useRef(0);
  const [data, setData] = useState<ThreadData | null>(null);

  // Принять свежие данные диалога: показать и, если есть непрочитанные, сразу отметить их
  // и обновить счётчики — список слева и бейдж в меню (иначе висят до следующего опроса).
  const apply = useCallback(
    (id: string, json: ThreadData) => {
      cacheRef.current.set(id, json);
      setData(json);
      if (json.unread) {
        void markThreadRead(id).then(() => {
          onListChanged?.();
          window.dispatchEvent(new Event(SUPPORT_READ_EVENT));
        });
      }
    },
    [onListChanged],
  );

  const reload = useCallback(() => {
    if (!activeId) return;
    const seq = ++fetchSeqRef.current;
    fetch(`/api/support/thread/${activeId}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<ThreadData>) : Promise.reject(r.status)))
      .then((json) => {
        if (fetchSeqRef.current !== seq) {
          cacheRef.current.set(activeId, json); // успел переключиться на другой чат — только в кэш
          return;
        }
        apply(activeId, json);
      })
      .catch(() => {
        // сеть подвела — оставляем то, что уже было показано
      });
  }, [activeId, apply]);

  useEffect(() => {
    if (!activeId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- диалог не выбран, показываем пустое состояние вместо предыдущего
      setData(null);
      return;
    }
    const cached = cacheRef.current.get(activeId);
    if (cached) setData(cached);
    reload();
  }, [activeId, reload]);

  // Живое обновление открытого диалога: лёгкий опрос, полная перезагрузка — только при изменениях.
  const versionRef = useRef<string | null>(null);
  useEffect(() => {
    versionRef.current = data && data.threadId === activeId ? data.version : null;
  }, [data, activeId]);
  useEffect(() => {
    if (!activeId) return;
    const tick = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const r = await fetch(`/api/support/thread/${activeId}?light=1`, { cache: "no-store" });
        if (!r.ok) return;
        const { version } = (await r.json()) as { version: string };
        if (version !== versionRef.current) reload();
      } catch {
        // сеть подвела — повторим на следующем тике
      }
    };
    const id = setInterval(tick, POLL_MS);
    // Вернулись на вкладку — проверяем сразу, не ждём тика.
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [activeId, reload]);

  if (!activeId || !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1.5 p-6 text-center">
        <p className="text-sm font-semibold text-ink">{t("support.pickThread")}</p>
      </div>
    );
  }

  return (
    <ThreadView
      key={data.threadId}
      threadId={data.threadId}
      status={data.status}
      source={data.source}
      archived={data.archived}
      identityTitle={data.identityTitle}
      identitySubtitle={data.identitySubtitle}
      messages={data.messages}
      guestPhone={data.guestPhone}
      guestNameGuess={data.guestNameGuess}
      alreadyLinked={data.alreadyLinked}
      initialMatches={data.initialMatches}
      quickReplies={data.quickReplies}
      backHref={backHref}
      locale={locale}
      onChanged={reload}
      onListChanged={onListChanged}
      onBack={onBack}
    />
  );
}
