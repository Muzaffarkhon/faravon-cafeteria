/**
 * Фирменные элементы «Фаровон».
 * PetalMark — знак-розетка из шести лепестков (мотив логотипа группы компаний).
 * Цвет лепестков наследуется через currentColor, поэтому знак красится `text-*`.
 */
import { cx } from "./ui";

export function PetalMark({
  className,
  title = "Фаровон",
}: {
  className?: string;
  title?: string;
}) {
  const petal = "M12 12C9.6 10.4 9.6 5.4 12 2.4C14.4 5.4 14.4 10.4 12 12Z";
  return (
    <svg
      viewBox="0 0 24 24"
      role="img"
      aria-label={title}
      className={cx("text-primary", className)}
    >
      <g fill="currentColor">
        {[0, 60, 120, 180, 240, 300].map((deg) => (
          <path key={deg} d={petal} transform={`rotate(${deg} 12 12)`} />
        ))}
      </g>
      <circle cx="12" cy="12" r="2.4" fill="var(--petal-500)" />
    </svg>
  );
}

/** Знак + название сервиса. Используется в шапке приложения и на экранах входа. */
export function BrandLockup({
  className,
  markClassName = "h-9 w-9",
  org = "Группа компаний «Фаровон»",
  title = "Кафетерий льгот",
}: {
  className?: string;
  markClassName?: string;
  org?: string;
  title?: string;
}) {
  return (
    <div className={cx("flex items-center gap-3", className)}>
      <PetalMark className={markClassName} />
      <div className="leading-tight">
        <div className="text-sm font-semibold text-ink">{title}</div>
        <div className="text-xs text-ink-muted">{org}</div>
      </div>
    </div>
  );
}
