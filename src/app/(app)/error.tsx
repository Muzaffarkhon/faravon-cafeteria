"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="petal-field mx-auto mt-10 max-w-md rounded-xl border border-dashed border-line-strong px-6 py-10 text-center">
      <h1 className="text-lg font-semibold text-ink">Что-то пошло не так</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Не удалось загрузить страницу. Обычно помогает повторить попытку — при повторении
        обратитесь к администратору.
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-[11px] text-ink-subtle">код: {error.digest}</p>
      )}
      <div className="mt-5 flex justify-center gap-3">
        <Button onClick={reset}>Повторить</Button>
        <Button variant="secondary" onClick={() => router.push("/")}>
          На главную
        </Button>
      </div>
    </div>
  );
}
