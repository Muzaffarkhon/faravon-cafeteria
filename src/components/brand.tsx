/**
 * Фирменные элементы «Фаровон».
 * Логотип и знак — реальные ассеты из public/brand (извлечены из брендбука).
 */
import Image from "next/image";
import { cx } from "./ui";

/** Знак «Фаровон» (тюльпан-розетка). Многоцветный, не красится через currentColor. */
export function BrandMark({
  className,
  size = 32,
  priority = false,
}: {
  className?: string;
  size?: number;
  priority?: boolean;
}) {
  return (
    <Image
      src="/brand/mark.png"
      alt="Фаровон"
      width={size}
      height={size}
      priority={priority}
      unoptimized
      className={cx("select-none", className)}
      draggable={false}
    />
  );
}

/** Полный вертикальный логотип «ФАРОВОН» (знак + слово). */
export function BrandLogo({
  className,
  width = 132,
}: {
  className?: string;
  width?: number;
}) {
  return (
    <Image
      src="/brand/logo.png"
      alt="ФАРОВОН"
      width={width}
      height={Math.round((width * 985) / 1709)}
      unoptimized
      className={cx("select-none", className)}
      draggable={false}
    />
  );
}

/** Знак + название сервиса. Шапка приложения и экраны входа. */
export function BrandLockup({
  className,
  markSize = 32,
  org = "Группа компаний «Фаровон»",
  title = "Кафетерий льгот",
}: {
  className?: string;
  markSize?: number;
  org?: string;
  title?: string;
}) {
  return (
    <div className={cx("flex items-center gap-3", className)}>
      <BrandMark size={markSize} priority />
      <div className="leading-tight">
        <div className="text-sm font-semibold text-ink">{title}</div>
        <div className="text-xs text-ink-muted">{org}</div>
      </div>
    </div>
  );
}
