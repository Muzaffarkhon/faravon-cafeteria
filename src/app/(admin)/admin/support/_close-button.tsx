"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import { closeThread } from "./actions";

export function CloseThreadButton({ threadId, locale }: { threadId: string; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [pending, start] = useTransition();
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={pending}
      onClick={() => start(async () => { await closeThread(threadId); })}
    >
      {t("support.close")}
    </Button>
  );
}
