"use client";

import { useState } from "react";
import { ImageUploadField } from "@/app/(app)/_components/image-upload-field";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";

/**
 * Поле изображения карточки льготы с редактором кадрирования и позиционирования (16:10).
 * Содержит скрытый <input name="imageUrl"> для отправки в серверные экшены createCard / updateCard.
 */
export function CardImageField({ initial, locale }: { initial?: string | null; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [url, setUrl] = useState(initial ?? "");

  return (
    <div>
      <input type="hidden" name="imageUrl" value={url} />
      <ImageUploadField
        value={url}
        onChange={setUrl}
        purpose="card"
        aspect={1.6}
        label={t("cards.form.imageLabel")}
        hint={t("cards.form.imageHint")}
        locale={locale}
      />
    </div>
  );
}
