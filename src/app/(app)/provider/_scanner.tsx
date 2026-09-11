"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Button } from "@/components/ui";

type Props = {
  onScan: (text: string) => void;
  /** Сразу включить камеру, как только компонент понял, что скан возможен. */
  autoStart?: boolean;
  /** Скан недоступен (десктоп) или камера не запустилась — родитель показывает ручной ввод. */
  onFallback?: () => void;
};

interface TgScan {
  showScanQrPopup?: (
    params: { text?: string },
    cb: (text: string) => boolean | void,
  ) => void;
  closeScanQrPopup?: () => void;
}

export function CouponScanner({ onScan, autoStart = false, onFallback }: Props) {
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Кнопку показываем, если есть либо нативный сканер Telegram, либо getUserMedia
  // (веб-камера ноутбука для QR тоже годится). Проверку делаем после гидратации —
  // SSR про устройство не знает.
  const [canScan, setCanScan] = useState(false);
  const [resolved, setResolved] = useState(false);
  const autoStartedRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const stop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setActive(false);
  }, []);

  useEffect(() => stop, [stop]);

  useEffect(() => {
    const tg = (window as unknown as { Telegram?: { WebApp?: TgScan } }).Telegram?.WebApp;
    const hasTgScan = !!tg?.showScanQrPopup;
    const hasCamera = !!navigator.mediaDevices?.getUserMedia;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCanScan(hasTgScan || hasCamera);
    setResolved(true);
  }, []);

  // Камера-первый сценарий (§касса): как только известно, что скан возможен —
  // сразу включаем камеру; если нет — просим родителя показать ручной ввод.
  useEffect(() => {
    if (!resolved || !autoStart || autoStartedRef.current) return;
    autoStartedRef.current = true;
    if (canScan) void start();
    else onFallback?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved, autoStart, canScan]);

  async function start() {
    setError(null);

    // 1. Внутри Telegram сначала пробуем нативный сканер. В некоторых клиентах
    //    showScanQrPopup объявлен, но при вызове бросает исключение — тогда не
    //    выходим, а переходим на getUserMedia ниже (раньше здесь падал весь
    //    обработчик клика, и кнопка «не реагировала»).
    const tg = (window as unknown as { Telegram?: { WebApp?: TgScan } }).Telegram?.WebApp;
    if (tg?.showScanQrPopup) {
      try {
        tg.showScanQrPopup({ text: "Наведите камеру на QR купона" }, (text) => {
          tg.closeScanQrPopup?.();
          if (text) onScan(text);
          return true;
        });
        return;
      } catch (e) {
        console.error("[CouponScanner] Telegram showScanQrPopup failed", e);
      }
    }

    // 2. Веб-камера. getUserMedia требует https (или localhost) — на http вернёт undefined.
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        window.isSecureContext
          ? "Камера недоступна в этом браузере. Введите номер вручную."
          : "Камера работает только по https. Откройте сайт по https или введите номер вручную.",
      );
      onFallback?.();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      setActive(true);
      // <video> монтируется всегда (просто скрыт, пока !active), поэтому ref
      // уже доступен и не нужно ждать перерисовку.
      const video = videoRef.current;
      if (!video) {
        stop();
        setError("Не удалось включить камеру. Введите номер вручную.");
        return;
      }
      video.srcObject = stream;
      await video.play();
      if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
      tick();
    } catch (e) {
      console.error("[CouponScanner] getUserMedia failed", e);
      const name = e instanceof DOMException ? e.name : "";
      setError(
        name === "NotAllowedError" || name === "SecurityError"
          ? "Доступ к камере отклонён. Разрешите камеру в настройках браузера или введите номер вручную."
          : name === "NotFoundError" || name === "OverconstrainedError"
            ? "Камера не найдена на устройстве. Введите номер вручную."
            : name === "NotReadableError"
              ? "Камера занята другим приложением. Закройте его и попробуйте снова."
              : "Не удалось включить камеру. Введите номер вручную.",
      );
      stop();
      onFallback?.();
    }
  }

  function tick() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    const w = video.videoWidth;
    const h = video.videoHeight;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    const code = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
    if (code?.data) {
      const text = code.data.trim();
      stop();
      onScan(text);
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }

  if (!canScan) return null;

  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <span className="text-xs text-ink-subtle">или</span>
        <span className="h-px flex-1 bg-line" />
      </div>
      <Button type="button" variant="secondary" onClick={start} hidden={active}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10" />
        </svg>
        Сканировать QR
      </Button>

      {/* Видео монтируется всегда: иначе videoRef.current === null в момент start(). */}
      <div className="space-y-2" hidden={!active}>
        <div className="relative overflow-hidden rounded-xl border border-line bg-black">
          <video ref={videoRef} playsInline muted className="block max-h-72 w-full object-cover" />
          <div className="pointer-events-none absolute inset-0 m-auto h-40 w-40 rounded-lg border-2 border-white/80" />
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={stop}>
          Остановить камеру
        </Button>
      </div>
      {error && (
        <p
          className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
