/**
 * Скоуп именно на содержимое диалога (не на всю страницу) — без этого файла
 * переход между чатами подхватывал общий `(admin)/loading.tsx`, а его
 * Suspense-границе не за что зацепиться внутри списка диалогов: она
 * разворачивается на весь `<main>`, включая уже смонтированную боковую
 * панель (`ThreadListLive`), и весь экран на миг становится белым.
 */
export default function Loading() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 p-6 text-center">
      <span
        className="h-8 w-8 animate-spin rounded-full border-[3px] border-line border-t-primary"
        aria-busy="true"
        aria-label="Загрузка…"
      />
    </div>
  );
}
