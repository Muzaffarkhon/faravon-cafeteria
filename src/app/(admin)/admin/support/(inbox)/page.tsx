/**
 * Реальную раскладку и данные рендерит `layout.tsx` (список + `ThreadViewLive`)
 * — эта страница нужна только чтобы у Next.js был маршрут `/admin/support`;
 * никакой серверной работы она не делает, поэтому переход сюда ничего не
 * подгружает и не вызывает Suspense-заглушку.
 */
export default function SupportPage() {
  return null;
}
