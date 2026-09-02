import Link from "next/link";
import { buttonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 360 }}>
        <h1 className="text-lg font-semibold text-ink">Страница не найдена</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Похоже, этой страницы не существует или у вас нет к ней доступа.
        </p>
        <Link href="/" className={buttonClass({ className: "mt-5" })}>
          На главную
        </Link>
      </div>
    </div>
  );
}
