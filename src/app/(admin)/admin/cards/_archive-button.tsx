"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import { setCardArchived } from "./actions";

export function CardArchiveButton({ id, archived, locale }: { id: string; archived: boolean; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col items-end">
      <Button
        variant={archived ? "success" : "secondary"}
        size="sm"
        disabled={pending}
        onClick={() => {
          setErr(null);
          start(async () => {
            const r = await setCardArchived(id, !archived);
            if (r?.error) setErr(r.error);
          });
        }}
      >
        {archived ? t("cards.returnFromArchive") : t("cards.toArchive")}
      </Button>
      {err && (
        <span className="mt-1 text-xs font-medium text-danger" role="alert">
          {err}
        </span>
      )}
    </span>
  );
}
