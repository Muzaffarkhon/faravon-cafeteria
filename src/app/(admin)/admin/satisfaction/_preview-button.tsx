"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { SatisfactionPrompt } from "@/app/(app)/_satisfaction-prompt";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";

/** Показывает опрос как он выглядит сотруднику — независимо от того, включена
 *  ли функция сейчас и есть ли у кого-то право её увидеть. Ответ никуда не
 *  сохраняется (см. `preview` в SatisfactionPrompt). */
export function SatisfactionPreviewButton({ locale }: { locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {t("satisfactionAdmin.preview")}
      </Button>
      {open && (
        <SatisfactionPrompt eligible={false} locale={locale} preview onClosePreview={() => setOpen(false)} />
      )}
    </>
  );
}
