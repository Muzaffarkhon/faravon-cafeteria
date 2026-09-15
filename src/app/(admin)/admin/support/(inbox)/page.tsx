import { db } from "@/lib/db";
import { getTranslator } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * Содержимое правой панели, когда диалог не выбран — сама раскладка и список
 * диалогов теперь в `layout.tsx` (общий с `[id]/page.tsx`), поэтому здесь
 * только пустое состояние.
 */
export default async function SupportPage() {
  const t = await getTranslator();
  const total = await db.supportThread.count();

  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 p-6 text-center">
      <p className="text-sm font-semibold text-ink">{t("support.pickThread")}</p>
      {total === 0 && <p className="text-xs text-ink-muted">{t("support.empty")}</p>}
    </div>
  );
}
