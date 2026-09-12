"use client";

import { useState } from "react";
import { ImageUploadField } from "@/app/(app)/_components/image-upload-field";

/**
 * Поле изображения карточки льготы с редактором кадрирования и позиционирования (16:10).
 * Содержит скрытый <input name="imageUrl"> для отправки в серверные экшены createCard / updateCard.
 */
export function CardImageField({ initial }: { initial?: string | null }) {
  const [url, setUrl] = useState(initial ?? "");

  return (
    <div>
      <input type="hidden" name="imageUrl" value={url} />
      <ImageUploadField
        value={url}
        onChange={setUrl}
        purpose="card"
        aspect={1.6}
        label="Изображение карточки"
        hint="Загрузите изображение и настройте его положение (кадрирование 16:10), либо укажите ссылку."
      />
    </div>
  );
}
