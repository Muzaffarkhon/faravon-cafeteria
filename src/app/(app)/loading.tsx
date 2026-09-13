import { getTranslator } from "@/lib/i18n";

/** Показывается при переходе между разделами, пока грузится серверный контент. */
export default async function Loading() {
  const t = await getTranslator();
  return (
    <div className="space-y-6" aria-busy="true" aria-label={t("misc.loading")}>
      <div className="flex items-center gap-3">
        <span className="h-6 w-6 shrink-0 animate-spin rounded-full border-2 border-line border-t-primary" />
        <div className="h-7 w-56 animate-pulse rounded-lg bg-surface-sunken" />
      </div>
      <div className="h-32 animate-pulse rounded-[20px] bg-surface-sunken/70" />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="h-24 animate-pulse rounded-[18px] bg-surface-sunken/60" />
        <div className="h-24 animate-pulse rounded-[18px] bg-surface-sunken/60" />
        <div className="h-24 animate-pulse rounded-[18px] bg-surface-sunken/60" />
        <div className="h-24 animate-pulse rounded-[18px] bg-surface-sunken/60" />
      </div>
    </div>
  );
}
