"use client";

import { useEffect, useRef, useState } from "react";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import { ThreadView, type Msg, type QuickReply } from "./[id]/_thread-view";
import type { EmployeeMatch } from "../actions";

type ThreadData = {
  threadId: string;
  status: "OPEN" | "CLOSED";
  source: "TELEGRAM" | "WEB";
  archived: boolean;
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
 * Уже открытые в этой сессии диалоги кэшируются в памяти и показываются
 * мгновенно при повторном клике; для остальных остаётся виден предыдущий
 * диалог, пока не подгрузится новый — экран никогда не становится пустым.
 */
export function ThreadViewLive({
  locale,
  activeId,
  backHref,
  onBack,
}: {
  locale: Locale;
  activeId: string | undefined;
  backHref: string;
  onBack: () => void;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  const cacheRef = useRef<Map<string, ThreadData>>(new Map());
  const fetchSeqRef = useRef(0);
  const [data, setData] = useState<ThreadData | null>(null);

  useEffect(() => {
    if (!activeId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- диалог не выбран, показываем пустое состояние вместо предыдущего
      setData(null);
      return;
    }
    const cached = cacheRef.current.get(activeId);
    if (cached) setData(cached);
    const seq = ++fetchSeqRef.current;
    fetch(`/api/support/thread/${activeId}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<ThreadData>) : Promise.reject(r.status)))
      .then((json) => {
        cacheRef.current.set(activeId, json);
        if (fetchSeqRef.current !== seq) return; // успел переключиться на другой чат
        setData(json);
      })
      .catch(() => {
        // сеть подвела — оставляем то, что уже было показано
      });
  }, [activeId]);

  function reload() {
    if (!activeId) return;
    fetch(`/api/support/thread/${activeId}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<ThreadData>) : Promise.reject(r.status)))
      .then((json) => {
        cacheRef.current.set(activeId, json);
        setData(json);
      })
      .catch(() => {});
  }

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
      onBack={onBack}
    />
  );
}
