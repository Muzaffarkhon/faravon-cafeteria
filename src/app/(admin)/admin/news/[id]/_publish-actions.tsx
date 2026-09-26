"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button } from "@/components/ui";
import { publishNews, sendNewsToBot } from "../actions";

export function NewsPublishActions({
  id,
  status,
  telegramSentAt,
}: {
  id: string;
  status: string;
  telegramSentAt: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<number | null>(null);

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        <Badge tone={status === "PUBLISHED" ? "success" : "neutral"}>
          {status === "PUBLISHED" ? "Опубликовано" : "Черновик"}
        </Badge>
        {status === "DRAFT" && (
          <Button
            size="sm"
            disabled={pending}
            onClick={() => {
              setError(null);
              start(async () => {
                const r = await publishNews(id);
                if (r?.error) setError(r.error);
                else router.refresh();
              });
            }}
          >
            Опубликовать
          </Button>
        )}
        {status === "PUBLISHED" && !telegramSentAt && (
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => {
              setError(null);
              start(async () => {
                const r = await sendNewsToBot(id);
                if (r?.error) setError(r.error);
                else {
                  setSent(r?.sent ?? 0);
                  router.refresh();
                }
              });
            }}
          >
            Отправить в бот
          </Button>
        )}
        {telegramSentAt && (
          <span className="text-xs text-ink-muted">
            В боте с {new Date(telegramSentAt).toLocaleString("ru-RU")}
          </span>
        )}
      </div>
      {error && <span className="text-xs font-medium text-danger">{error}</span>}
      {sent != null && <span className="text-xs font-medium text-success-strong">Отправлено: {sent}</span>}
    </div>
  );
}
