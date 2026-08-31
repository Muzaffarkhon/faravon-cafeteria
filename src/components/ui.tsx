/**
 * UI-примитивы «Кафетерий льгот».
 * Единый словарь компонентов поверх дизайн-токенов из globals.css.
 * Без хуков и серверных API — компонент можно импортировать и в RSC, и в client-компоненты.
 */
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  ReactNode,
} from "react";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ Button --- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
type ButtonSize = "sm" | "md";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-md font-medium " +
  "transition-[background-color,border-color,color,box-shadow] duration-150 " +
  "disabled:opacity-50 disabled:pointer-events-none " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-on-brand shadow-xs hover:bg-primary-hover active:bg-primary-active",
  secondary:
    "border border-line-strong bg-surface text-ink shadow-xs hover:bg-surface-muted",
  ghost: "text-ink-muted hover:bg-surface-muted hover:text-ink",
  danger:
    "border border-danger-border text-danger hover:bg-danger-soft active:bg-primary-soft-hover",
  success: "bg-success text-on-brand shadow-xs hover:bg-success-strong",
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "px-2.5 py-1 text-xs",
  md: "px-3.5 py-2 text-sm",
};

export function buttonClass(
  opts: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {},
): string {
  const { variant = "primary", size = "md", className } = opts;
  return cx(BUTTON_BASE, BUTTON_VARIANT[variant], BUTTON_SIZE[size], className);
}

export function Button({
  variant,
  size,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return <button className={buttonClass({ variant, size, className })} {...props} />;
}

/* ------------------------------------------------------------- Form controls --- */

const CONTROL_BASE =
  "control-focus w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink " +
  "shadow-xs outline-none transition-[border-color,box-shadow] duration-150 " +
  "placeholder:text-ink-subtle " +
  "disabled:bg-surface-muted disabled:text-ink-muted aria-[invalid=true]:border-danger";

export function inputClass(className?: string): string {
  return cx(CONTROL_BASE, className);
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={inputClass(className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={inputClass(className)} {...props} />;
}

export function Select({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={inputClass(className)} {...props} />;
}

/** Подпись + подсказка + ошибка вокруг любого контрола. */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  required,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  htmlFor?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("space-y-1", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
        {required && <span className="ml-0.5 text-primary">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-ink-muted">{hint}</p>}
      {error && (
        <p className="text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- Card --- */

export function Card({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div
      className={cx(
        "rounded-xl border border-line bg-surface shadow-sm",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx("border-b border-line-subtle px-5 py-3", className)}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------- Badge --- */

export type BadgeTone =
  | "neutral"
  | "brand"
  | "success"
  | "warning"
  | "accent"
  | "muted";

const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: "bg-surface-muted text-ink-muted",
  brand: "bg-primary-soft text-primary-strong",
  success: "bg-success-soft text-success-strong",
  warning: "bg-warning-soft text-warning-strong",
  accent: "bg-petal-100 text-petal-600",
  muted: "bg-surface-muted text-ink-subtle line-through",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        BADGE_TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* -------------------------------------------------------------- Page chrome --- */

export function PageHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex flex-wrap items-start justify-between gap-3",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-lg font-semibold text-ink">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-ink-muted">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function SectionTitle({
  children,
  count,
  className,
}: {
  children: ReactNode;
  count?: number;
  className?: string;
}) {
  return (
    <h2
      className={cx(
        "text-base font-semibold text-primary-strong",
        className,
      )}
    >
      {children}
      {count != null && (
        <span className="ml-1.5 font-normal text-ink-subtle">({count})</span>
      )}
    </h2>
  );
}

/** Пустое состояние: сообщение + необязательное действие, на фирменной подложке. */
export function EmptyState({
  children,
  action,
  className,
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "petal-field flex flex-col items-center gap-3 rounded-xl border border-dashed border-line-strong px-6 py-10 text-center",
        className,
      )}
    >
      <p className="max-w-sm text-sm text-ink-muted">{children}</p>
      {action}
    </div>
  );
}
