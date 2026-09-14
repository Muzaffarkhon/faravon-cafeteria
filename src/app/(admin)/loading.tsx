import { getTranslator } from "@/lib/i18n";
import { RouteLoadingSpinner } from "@/components/route-loading-spinner";

/** Показывается при переходе между разделами админ-панели, пока грузится серверный контент. */
export default async function Loading() {
  const t = await getTranslator();
  return <RouteLoadingSpinner label={t("misc.loading")} />;
}
