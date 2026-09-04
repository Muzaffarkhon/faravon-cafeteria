import Link from "next/link";
import { BrandMark } from "@/components/brand";
import { PetalDrift } from "@/components/petals";
import { buttonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="petal-field relative grid min-h-dvh place-items-center overflow-hidden p-4">
      <PetalDrift />
      <div className="relative z-10 w-full max-w-sm rounded-[24px] bg-surface p-8 text-center shadow-[0_20px_60px_oklch(0.22_0.03_30_/_0.15)]">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary-strong">
          <BrandMark size={32} />
        </span>
        <div className="mt-4 font-display text-3xl font-bold text-primary">404</div>
        <h1 className="mt-1 text-lg font-bold text-ink">Страница не найдена</h1>
        <p className="mt-2 text-sm leading-6 text-ink-muted">
          Похоже, этой страницы не существует или у вас нет к ней доступа.
        </p>
        <Link href="/" className={buttonClass({ fullWidth: true, className: "mt-6" })}>
          На главную
        </Link>
      </div>
    </main>
  );
}
