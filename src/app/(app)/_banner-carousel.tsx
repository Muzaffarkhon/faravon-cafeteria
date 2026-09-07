"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui";

export type BannerSlide = {
  id: string;
  kind?: "partner" | "news" | "group";
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  linkHref: string | null;
  external: boolean;
  cta: string;
};

const KIND_LABEL: Record<NonNullable<BannerSlide["kind"]>, string> = {
  partner: "Партнёр",
  news: "Новость",
  group: "Групповая льгота",
};

const AUTOPLAY_MS = 6000;

export function BannerCarousel({ slides }: { slides: BannerSlide[] }) {
  const count = slides.length;
  const loop = count > 1;

  // Три копии подряд; позиция живёт вокруг средней копии — так при любом
  // направлении (и автопрокрутке, и перетаскивании) слева и справа всегда
  // есть реальные слайды, «отскока назад» в конце нет.
  // Стартовый слайд выбирается случайно (§6): при каждом заходе показывается
  // разный баннер, а не всегда первый.
  const [pos, setPos] = useState(() =>
    count > 1 ? count + Math.floor(Math.random() * count) : count,
  ); // единицы = ширина слайда
  const [animate, setAnimate] = useState(true);
  const [paused, setPaused] = useState(false);

  const pressed = useRef(false);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startPos = useRef(0);
  const width = useRef(1);
  const moved = useRef(false);
  const trackRef = useRef<HTMLDivElement>(null);

  // держим pos в пределах средней копии [count, 2*count)
  const normalize = useCallback(
    (p: number) => {
      if (!loop) return p;
      let n = p;
      while (n >= 2 * count) n -= count;
      while (n < count) n += count;
      return n;
    },
    [loop, count],
  );

  // userPaused — явная остановка кнопкой; paused — временная (hover / фокус внутри).
  const [userPaused, setUserPaused] = useState(false);
  useEffect(() => {
    if (!loop || paused || userPaused) return;
    const t = setInterval(() => {
      setAnimate(true);
      setPos((p) => p + 1);
    }, AUTOPLAY_MS);
    return () => clearInterval(t);
  }, [loop, paused, userPaused]);

  // Когда pos вышел за среднюю копию — после завершения анимации бесшовно
  // возвращаем его в диапазон [count, 2*count) без анимации (слайд тот же).
  useEffect(() => {
    if (!loop) return;
    const n = normalize(pos);
    if (n === pos) return;
    const id = setTimeout(
      () => {
        setAnimate(false);
        setPos(n);
      },
      animate ? 520 : 0,
    );
    return () => clearTimeout(id);
  }, [pos, animate, loop, normalize]);

  function step(delta: number) {
    setAnimate(true);
    setPos((p) => p + delta);
  }

  function goToDot(i: number) {
    setAnimate(true);
    setPos((p) => {
      const base = Math.round(p);
      const cur = ((base % count) + count) % count;
      return base + (i - cur);
    });
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!loop || e.button !== 0) return; // только левая кнопка
    pressed.current = true;
    dragging.current = false;
    moved.current = false;
    startX.current = e.clientX;
    startPos.current = pos;
    width.current = trackRef.current?.offsetWidth || 1;
    setPaused(true);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!pressed.current) return;
    const d = e.clientX - startX.current;
    if (Math.abs(d) > 6) {
      moved.current = true;
      if (!dragging.current) {
        dragging.current = true;
        setAnimate(false);
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          /* noop */
        }
      }
    }
    if (dragging.current) setPos(normalize(startPos.current - d / width.current));
  }
  function onPointerUp() {
    if (!pressed.current) return;
    pressed.current = false;
    setPaused(false);
    if (dragging.current) {
      dragging.current = false;
      setAnimate(true);
      setPos((p) => Math.round(p)); // доводим до ближайшего слайда
    }
  }

  const activeDot = loop ? (((Math.round(pos) % count) + count) % count) : 0;
  const rendered = loop ? [...slides, ...slides, ...slides] : slides;

  return (
    <section
      className="relative"
      aria-roledescription="карусель"
      aria-label="Баннеры партнёров"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        // снимаем паузу, только когда фокус ушёл за пределы карусели
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setPaused(false);
      }}
    >
      <div
        ref={trackRef}
        className={cx("overflow-hidden rounded-[26px]", loop && "cursor-grab active:cursor-grabbing")}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDragStart={(e) => e.preventDefault()}
        onContextMenu={(e) => loop && e.preventDefault()}
        onClickCapture={(e) => {
          // если было перетаскивание — не даём сработать ссылке баннера
          if (moved.current) {
            e.preventDefault();
            e.stopPropagation();
            moved.current = false;
          }
        }}
        style={{ touchAction: "pan-y" }}
      >
        <div
          className={cx("flex", animate && "transition-transform duration-500 ease-out")}
          style={{ transform: `translateX(-${pos * 100}%)` }}
        >
          {rendered.map((b, i) => {
            const inner = (
              <>
                {b.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={b.imageUrl}
                    alt=""
                    loading="lazy"
                    draggable={false}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                )}
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/5"
                />
                <div className="absolute left-4 top-4 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white backdrop-blur">
                  {KIND_LABEL[b.kind ?? "partner"]}
                </div>
                <div className="relative z-10 max-w-2xl p-5 sm:p-6">
                  <h2 className="text-lg font-semibold leading-tight text-balance text-white sm:text-xl">
                    {b.title}
                  </h2>
                  {b.subtitle && (
                    <p className="mt-1.5 text-sm leading-6 text-white/85 line-clamp-2">{b.subtitle}</p>
                  )}
                  {b.linkHref && (
                    <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-white">
                      {b.cta}
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </span>
                  )}
                </div>
              </>
            );
            const cls =
              "relative flex h-52 w-full shrink-0 items-end overflow-hidden border border-line bg-surface-sunken shadow-md select-none sm:h-64";
            return b.linkHref ? (
              <a
                key={`${b.id}-${i}`}
                href={b.linkHref}
                {...(b.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                onClick={(e) => {
                  if (moved.current) e.preventDefault();
                }}
                className={cls}
              >
                {inner}
              </a>
            ) : (
              <div key={`${b.id}-${i}`} className={cls}>
                {inner}
              </div>
            );
          })}
        </div>
      </div>

      {loop && (
        <>
          <button
            type="button"
            aria-label="Предыдущий баннер"
            onClick={() => step(-1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/35 p-1.5 text-white backdrop-blur transition hover:bg-black/55"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <button
            type="button"
            aria-label="Следующий баннер"
            onClick={() => step(1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/35 p-1.5 text-white backdrop-blur transition hover:bg-black/55"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
          </button>
          <button
            type="button"
            aria-label={userPaused ? "Возобновить автопрокрутку баннеров" : "Остановить автопрокрутку баннеров"}
            aria-pressed={userPaused}
            onClick={() => setUserPaused((v) => !v)}
            className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur transition hover:bg-black/55"
          >
            {userPaused ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
            )}
          </button>
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                aria-label={`Баннер ${i + 1}`}
                onClick={() => goToDot(i)}
                className={cx(
                  "h-1.5 rounded-full transition-all",
                  i === activeDot ? "w-5 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80",
                )}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
