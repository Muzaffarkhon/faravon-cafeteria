"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buttonClass, cx } from "@/components/ui";
import { translate, type TKey } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import { CardDetailsButton, type CardDetails } from "../../_components/card-details";
import { spinWheelAction } from "../_actions";
import type { SpinResult } from "@/lib/wheel";

export type WheelSectorView = {
  id: string;
  kind: "COUPON" | "COINS" | "NOTHING";
  label: string;
  coins: number | null;
  imageUrl: string | null;
  block: "soldOut" | "taken" | "noPeriod" | "cardUnavailable" | null;
  card: CardDetails | null;
};

// Геометрия в координатах viewBox 400×400: листки — фирменная «линза» из двух дуг
// (как в petals.tsx), лучами от центральной розетки к краю.
const C = 200;
const R_IN = 40;
const R_OUT = 190;
const SPIN_MS = 5200;

/** Ширина глифа жирного шрифта в долях кегля — с запасом для кириллицы. */
const CHAR_W = 0.64;

/**
 * Раскладка содержимого листка по его реальной ширине: фото/значок — в самом
 * широком месте и не шире листка, подпись — между центром и значком, с кеглем и
 * числом символов/строк, которые гарантированно помещаются в границы листка.
 */
function leafLayout(n: number) {
  const len = R_OUT - R_IN;
  const mid = (R_IN + R_OUT) / 2;
  const half = Math.min(len * 0.3, ((Math.PI * mid) / n) * 0.94);
  const r = (half * half + (len / 2) ** 2) / (2 * half);
  // Полуширина листка на расстоянии rad от центра колеса.
  const widthAt = (rad: number) => Math.max(0, Math.sqrt(r * r - (rad - mid) ** 2) - (r - half));

  const badgeAt = mid + len * 0.18;
  const badgeR = Math.max(8, Math.min(22, widthAt(badgeAt) - 4));
  const labelTo = badgeAt - badgeR - 5;
  const fontSize = n > 10 ? 8.5 : 10;
  const lineStep = fontSize * 1.15;
  // Ближайшая к центру точка, где листок уже шире N строк текста.
  const fromFor = (lines: number) => {
    const need = (lines * lineStep) / 2 + 2;
    for (let rad = R_IN; rad < labelTo; rad++) if (widthAt(rad) >= need) return rad;
    return labelTo;
  };
  const charsBetween = (from: number) => Math.max(0, Math.floor((labelTo - from) / (fontSize * CHAR_W)));
  const twoFrom = fromFor(2);
  const lines = charsBetween(twoFrom) >= 6 ? 2 : 1;
  const labelFrom = lines === 2 ? twoFrom : fromFor(1);

  return {
    d: `M${C} ${C - R_IN}A${r} ${r} 0 0 1 ${C} ${C - R_OUT}A${r} ${r} 0 0 1 ${C} ${C - R_IN}Z`,
    badgeY: C - badgeAt,
    badgeR,
    labelY: C - (labelFrom + labelTo) / 2,
    fontSize,
    lineStep,
    lines,
    maxChars: Math.max(3, charsBetween(labelFrom)),
  };
}

const truncate = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** До двух строк по словам — подпись идёт вдоль узкого листка. */
function wrapLabel(s: string, max: number, lines: number): string[] {
  if (lines === 1 || s.length <= max) return [truncate(s, max)];
  const words = s.split(/\s+/);
  let first = "";
  while (words.length && (first ? `${first} ${words[0]}` : words[0]).length <= max) first = first ? `${first} ${words.shift()}` : words.shift()!;
  // Первое слово длиннее строки — переносим его с дефисом.
  if (!first) return [`${s.slice(0, max - 1)}-`, truncate(s.slice(max - 1), max)];
  return words.length ? [first, truncate(words.join(" "), max)] : [first];
}

export function GiftWheel({
  sectors,
  cost,
  balance,
  spunToday,
  locale,
  coinUnit,
}: {
  sectors: WheelSectorView[];
  cost: number;
  balance: number;
  spunToday: boolean;
  locale: Locale;
  coinUnit: string;
}) {
  const t = (key: TKey) => translate(locale, key);
  const router = useRouter();
  const uid = useId().replace(/:/g, "");
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [duration, setDuration] = useState(SPIN_MS);
  const [error, setError] = useState<string | null>(null);
  const [win, setWin] = useState<{ result: SpinResult; sector: WheelSectorView | null } | null>(null);
  const [showWin, setShowWin] = useState(false);
  const pendingWin = useRef<typeof win>(null);

  const n = sectors.length;
  const step = n ? 360 / n : 360;
  const leaf = leafLayout(Math.max(n, 2));
  const { badgeR, badgeY } = leaf;

  const missing = cost - balance;
  const disabled = spinning || spunToday || n === 0 || missing > 0;

  const finish = () => {
    if (!pendingWin.current) return;
    setWin(pendingWin.current);
    pendingWin.current = null;
    setShowWin(true);
    setSpinning(false);
    router.refresh();
  };

  const spin = async () => {
    if (disabled) return;
    setError(null);
    setSpinning(true);
    const r = await spinWheelAction();
    if (r.error || !r.result) {
      setError(r.error ?? "Ошибка");
      setSpinning(false);
      router.refresh();
      return;
    }
    const index = sectors.findIndex((s) => s.id === r.result!.sectorId);
    pendingWin.current = { result: r.result, sector: index >= 0 ? sectors[index] : null };
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const ms = reduced ? 700 : SPIN_MS;
    setDuration(ms);
    if (index < 0) {
      // Раскладку поменяли, пока страница была открыта — показываем приз без докрутки.
      finish();
      return;
    }
    // Листок i стоит на угле i·step по часовой; под стрелку (0°) его приводит поворот −i·step.
    const current = ((rotation % 360) + 360) % 360;
    const target = (((-index * step - current) % 360) + 360) % 360;
    // Небольшой разброс, чтобы остановка не выглядела «по линейке», но стрелка у
    // узкого кончика листка всё равно однозначно на нём.
    const jitter = (Math.random() - 0.5) * step * 0.12;
    setRotation(rotation + (reduced ? 360 : 360 * 6) + target + jitter);
    // Страховка, если transitionend не придёт (вкладка ушла в фон и т.п.).
    window.setTimeout(finish, ms + 800);
  };

  const blockLabel = (b: WheelSectorView["block"]) =>
    b === "soldOut" ? t("wheel.soldOut") : b === "taken" ? t("wheel.taken") : b ? "—" : null;

  if (n === 0) {
    return <p className="rounded-[16px] bg-surface p-6 text-center text-sm text-ink-muted shadow-sm">{t("wheel.empty")}</p>;
  }

  return (
    <div className="space-y-5">
      <div className="relative mx-auto aspect-square w-full max-w-[380px]">
        <div
          className="h-full w-full"
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: spinning ? `transform ${duration}ms cubic-bezier(0.12, 0.72, 0.1, 1)` : "none",
          }}
          onTransitionEnd={finish}
        >
          <svg viewBox="0 0 400 400" className="h-full w-full drop-shadow-[0_10px_30px_rgba(0,0,0,0.12)]" role="img" aria-label={t("wheel.title")}>
            <defs>
              <clipPath id={`${uid}-badge`}>
                <circle cx={C} cy={badgeY} r={badgeR - 2} />
              </clipPath>
            </defs>
            <circle cx={C} cy={C} r={198} fill="var(--primary-soft)" />
            <circle cx={C} cy={C} r={198} fill="none" stroke="var(--primary)" strokeOpacity={0.25} strokeWidth={3} />
            {sectors.map((s, i) => {
              const blocked = !!s.block;
              // Занятый листок красим в заметно серый (не почти белый var(--surface-muted)) —
              // иначе на светлом фоне колеса (var(--primary-soft)) он сливался с фоном и
              // почти не читался (жалоба: «уже выбранные купоны листа слишком белые»).
              const fill = blocked ? "var(--line-strong)" : i % 2 === 0 ? "var(--brand-500)" : "var(--petal-400)";
              const { labelY, fontSize, lineStep } = leaf;
              const text = blockLabel(s.block) ?? (s.kind === "NOTHING" ? t("wheel.nothing") : s.label);
              const lines = wrapLabel(text, leaf.maxChars, leaf.lines);
              const coinsText = `+${s.coins ?? 0}`;
              // Кегль числа монет — чтобы и «+5», и «+1000» помещались в кружок.
              const coinsFont = Math.min(badgeR * 0.72, (badgeR * 1.7) / (coinsText.length * CHAR_W));
              return (
                <g key={s.id} transform={`rotate(${i * step} ${C} ${C})`}>
                  <path d={leaf.d} fill={fill} stroke="var(--surface)" strokeWidth={2} />
                  <circle cx={C} cy={badgeY} r={badgeR} fill="var(--surface)" />
                  {s.kind === "COUPON" && s.imageUrl ? (
                    <image
                      href={s.imageUrl}
                      x={C - badgeR}
                      y={badgeY - badgeR}
                      width={badgeR * 2}
                      height={badgeR * 2}
                      preserveAspectRatio="xMidYMid slice"
                      clipPath={`url(#${uid}-badge)`}
                      opacity={blocked ? 0.45 : 1}
                    />
                  ) : s.kind === "COINS" ? (
                    <text x={C} y={badgeY} textAnchor="middle" dominantBaseline="central" fontSize={coinsFont} fontWeight={800} fill="var(--primary)">
                      {coinsText}
                    </text>
                  ) : s.kind === "COUPON" ? (
                    // подарок — купон без картинки
                    <path
                      transform={`translate(${C - badgeR * 0.5} ${badgeY - badgeR * 0.5}) scale(${badgeR / 24})`}
                      d="M3 10h18v11H3zM2 6h20v4H2zM12 6v15M12 6c-2-4-7-4-7-1s5 1 7 1c2 0 7 2 7-1s-5-3-7 1"
                      fill="none"
                      stroke="var(--primary)"
                      strokeWidth={2.2}
                      strokeLinejoin="round"
                    />
                  ) : (
                    <path
                      transform={`translate(${C - badgeR * 0.45} ${badgeY - badgeR * 0.45}) scale(${(badgeR * 0.9) / 24})`}
                      d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8-4.2-4.1 5.9-.9z"
                      fill="var(--primary)"
                      opacity={0.5}
                    />
                  )}
                  <text
                    transform={`rotate(-90 ${C} ${labelY})`}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={fontSize}
                    fontWeight={700}
                    fill={blocked ? "var(--ink-muted)" : "var(--on-brand)"}
                  >
                    {lines.map((line, li) => (
                      <tspan key={li} x={C} y={labelY + (li - (lines.length - 1) / 2) * lineStep}>
                        {line}
                      </tspan>
                    ))}
                  </text>
                </g>
              );
            })}
            <circle cx={C} cy={C} r={R_IN - 4} fill="var(--surface)" stroke="var(--primary)" strokeOpacity={0.2} strokeWidth={2} />
            <image href="/brand/mark.png" x={C - 24} y={C - 24} width={48} height={48} />
          </svg>
        </div>
        {/* Стрелка не вращается — колесо крутится под ней */}
        <svg viewBox="0 0 40 52" className="pointer-events-none absolute left-1/2 top-[-14px] w-10 -translate-x-1/2 drop-shadow-md" aria-hidden="true">
          <path d="M20 50C20 50 3 30 3 19a17 17 0 0 1 34 0c0 11-17 31-17 31z" fill="var(--primary)" />
          <circle cx={20} cy={19} r={7} fill="var(--surface)" />
        </svg>
      </div>

      {error && (
        <p className="rounded-[12px] bg-danger-soft px-3 py-2 text-center text-sm font-semibold text-danger" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={spin}
        disabled={disabled}
        className={cx(buttonClass({ size: "lg", fullWidth: true }), "!rounded-[18px] !py-4 text-base")}
      >
        {spinning
          ? t("wheel.spinning")
          : spunToday
            ? t("wheel.spunToday")
            : missing > 0
              ? `${t("wheel.notEnough")} ${missing} ${coinUnit}`
              : cost > 0
                ? `${t("wheel.spin")} · ${cost} ${coinUnit}`
                : t("wheel.spin")}
      </button>

      {showWin && win && <WinDialog win={win} locale={locale} coinUnit={coinUnit} onClose={() => setShowWin(false)} />}
    </div>
  );
}

function WinDialog({
  win,
  locale,
  coinUnit,
  onClose,
}: {
  win: { result: SpinResult; sector: WheelSectorView | null };
  locale: Locale;
  coinUnit: string;
  onClose: () => void;
}) {
  const t = (key: TKey) => translate(locale, key);
  const closeRef = useRef<HTMLButtonElement>(null);
  const { result, sector } = win;

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const title =
    result.kind === "COUPON" ? t("wheel.winCouponTitle") : result.kind === "COINS" ? t("wheel.winCoinsTitle") : t("wheel.winNothingTitle");

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/40 p-5" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[380px] overflow-hidden rounded-[24px] bg-surface shadow-[0_20px_60px_rgba(0,0,0,0.25)]"
      >
        {result.kind === "COUPON" && sector?.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={sector.imageUrl} alt="" className="aspect-[16/10] w-full object-cover" />
        )}
        <div className="space-y-3 p-6 text-center">
          <p className="font-display text-xl font-bold text-ink">{title}</p>
          {result.kind === "COUPON" && (
            <>
              <p className="text-base font-semibold text-ink">{sector?.card?.title ?? result.prizeLabel}</p>
              {sector?.card?.partnerName && <p className="text-sm text-ink-muted">{sector.card.partnerName}</p>}
              <p className="text-sm text-ink-muted">{t("wheel.winCouponText")}</p>
            </>
          )}
          {result.kind === "COINS" && (
            <p className="font-display text-3xl font-extrabold text-primary">
              +{result.coins} <span className="text-base font-bold">{coinUnit}</span>
            </p>
          )}
          {result.kind === "NOTHING" && <p className="text-sm text-ink-muted">{t("wheel.winNothingText")}</p>}
          <div className="flex flex-col gap-2 pt-2">
            {result.kind === "COUPON" && (
              <>
                <Link href="/applications" className={buttonClass({ fullWidth: true })}>
                  {t("wheel.myCoupon")}
                </Link>
                {sector?.card && (
                  <div className="flex justify-center">
                    <CardDetailsButton card={sector.card} locale={locale} />
                  </div>
                )}
              </>
            )}
            <button ref={closeRef} type="button" onClick={onClose} className={buttonClass({ variant: "secondary", fullWidth: true })}>
              {t("wheel.close")}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
