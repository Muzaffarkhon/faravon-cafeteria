"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Button } from "@/components/ui";

type Props = {
  onScan: (text: string) => void;
};

export function CouponScanner({ onScan }: Props) {
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  async function start() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Камера недоступна в этом браузере. Введите номер вручную.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      setActive(true);
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
      tick();
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      setError(
        name === "NotAllowedError"
          ? "Доступ к камере отклонён. Разрешите камеру или введите номер вручную."
          : "Не удалось включить камеру. Введите номер вручную.",
      );
      stop();
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

  return (
    <div>
      {!active ? (
        <Button type="button" variant="secondary" onClick={start}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10" />
          </svg>
          Сканировать QR
        </Button>
      ) : (
        <div className="space-y-2">
          <div className="relative overflow-hidden rounded-xl border border-line bg-black">
            <video ref={videoRef} playsInline muted className="block max-h-72 w-full object-cover" />
            <div className="pointer-events-none absolute inset-0 m-auto h-40 w-40 rounded-lg border-2 border-white/80" />
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={stop}>
            Остановить камеру
          </Button>
        </div>
      )}
      {error && (
        <p className="mt-2 text-sm text-ink-muted" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
