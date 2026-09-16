import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, cx } from "@/components/ui";
import { safeImageSrc } from "@/lib/safe-url";
import { QrZoom } from "./_qr-zoom";

/**
 * Купон/промокод в виде «билета»: фото льготы сверху, линия отрыва, снизу —
 * код и детали. Только фирменный красный (primary) — без зелёного/бежевого,
 * по просьбе после ревью первого макета.
 */

type TicketCard = { title: string; imageUrl: string | null; condition: string | null };
type TicketPartner = {
  name: string | null;
  address: string | null;
  workingHours: string | null;
  discountType: string | null;
} | null;

function PinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0">
      <path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4l3 2" />
    </svg>
  );
}
function TagIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0">
      <path d="M9 14 15 8M9 8h.01M15 14h.01" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}
function PhoneIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function TicketPhoto({ card, partner, tag }: { card: TicketCard; partner: TicketPartner; tag?: string | null }) {
  const src = safeImageSrc(card.imageUrl);
  return (
    <div className="relative h-32 shrink-0 overflow-hidden rounded-t-[20px] bg-surface-sunken">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" className="h-full w-full object-contain" />
      ) : (
        <div className="h-full w-full bg-[repeating-linear-gradient(135deg,var(--sand-200)_0_10px,var(--sand-100)_10px_20px)]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
      {tag && (
        <span className="absolute right-3 top-3 rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold text-on-brand shadow-sm">
          {tag}
        </span>
      )}
      <div className="absolute inset-x-0 bottom-0 p-3.5">
        {partner?.name && <div className="text-[11px] font-semibold text-white/85">{partner.name}</div>}
        <div className="text-[15px] font-bold leading-snug text-balance text-white">{card.title}</div>
      </div>
    </div>
  );
}

/** Линия отрыва — пунктир с полукруглыми вырезами, «оторванный корешок» билета. */
function Perforation() {
  return (
    <div className="relative h-0 shrink-0" aria-hidden="true">
      <div className="absolute inset-x-5 top-0 border-t-2 border-dashed border-line-strong" />
      <span className="absolute -left-2.5 -top-2.5 h-5 w-5 rounded-full bg-canvas" />
      <span className="absolute -right-2.5 -top-2.5 h-5 w-5 rounded-full bg-canvas" />
    </div>
  );
}

function TicketDetails({ partner, extra }: { partner: TicketPartner; extra?: string | null }) {
  if (!partner?.address && !partner?.workingHours && !extra) return null;
  return (
    <div className="mt-4 space-y-2 border-t border-line pt-3.5 text-[13px] text-ink-subtle">
      {partner?.address && (
        <div className="flex gap-2">
          <PinIcon />
          {partner.address}
        </div>
      )}
      {partner?.workingHours && (
        <div className="flex gap-2">
          <ClockIcon />
          {partner.workingHours}
        </div>
      )}
      {extra && (
        <div className="flex gap-2">
          <TagIcon />
          {extra}
        </div>
      )}
    </div>
  );
}

function StatusChip({ tone, children }: { tone: "active" | "warning"; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold",
        tone === "active" ? "bg-primary-soft text-primary-strong" : "bg-warning-soft text-warning-strong",
      )}
    >
      <span className={cx("h-1.5 w-1.5 rounded-full", tone === "active" ? "bg-primary" : "bg-warning")} />
      {children}
    </span>
  );
}

export function CouponTicket({
  card,
  partner,
  couponNumber,
  qr,
  validPeriod,
  hint,
  live,
  expired,
  overdueLabel,
  activeLabel,
  couponLabel,
  contactSupportLabel,
}: {
  card: TicketCard;
  partner: TicketPartner;
  couponNumber: string;
  qr: string | null;
  validPeriod: string | null;
  hint: string | null;
  live: boolean;
  expired: boolean;
  overdueLabel: string;
  activeLabel: string;
  couponLabel: string;
  contactSupportLabel: string;
}) {
  return (
    <li className="flex flex-col overflow-visible rounded-[20px] bg-surface shadow-md">
      <TicketPhoto card={card} partner={partner} tag={card.condition} />
      <Perforation />
      <div className="px-5 pb-5 pt-4">
        <div className="mb-3.5 flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-ink">{couponLabel}</span>
          {expired ? (
            <Badge tone="warning" className="px-2 py-0.5 text-[11px]">
              {overdueLabel}
            </Badge>
          ) : (
            live && <StatusChip tone="active">{activeLabel}</StatusChip>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {qr && <QrZoom svg={qr} number={couponNumber} />}
          <div className="min-w-[160px] flex-1 space-y-1">
            <div className="font-mono text-[17px] font-bold text-ink" data-numeric>
              <span className="text-ink-subtle">№</span> {couponNumber}
            </div>
            {validPeriod && (
              <div className="text-[13px] text-ink-muted" data-numeric>
                {validPeriod}
              </div>
            )}
            {hint && (
              <div className="pt-0.5 text-xs text-ink-muted">
                {hint}
                {live && !qr && (
                  <>
                    {" "}
                    <Link href="/feedback" className="font-medium text-primary-strong underline underline-offset-2">
                      {contactSupportLabel}
                    </Link>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <TicketDetails partner={partner} extra={partner?.discountType} />
      </div>
    </li>
  );
}

export function TaxiTicket({
  card,
  partner,
  phone,
  promo,
  blocked,
  hint,
  showSupportLink,
  taxiLabel,
  statusLabel,
  promoBadgeLabel,
  promoCaptionLabel,
  contactSupportLabel,
}: {
  card: TicketCard;
  partner: TicketPartner;
  phone: string;
  promo: string | null;
  blocked: boolean;
  hint: string;
  showSupportLink: boolean;
  taxiLabel: string;
  statusLabel: string;
  promoBadgeLabel: string;
  promoCaptionLabel: string;
  contactSupportLabel: string;
}) {
  return (
    <li className="flex flex-col overflow-visible rounded-[20px] bg-surface shadow-md">
      <TicketPhoto card={card} partner={partner} tag={promoBadgeLabel} />
      <Perforation />
      <div className="px-5 pb-5 pt-4">
        <div className="mb-3.5 flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-ink">{taxiLabel}</span>
          <StatusChip tone={blocked ? "warning" : "active"}>{statusLabel}</StatusChip>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="min-w-[180px] flex-1 rounded-2xl border-2 border-dashed border-primary-border bg-primary-soft/50 px-4 py-3.5 text-center">
            {promo ? (
              <>
                <div className="font-mono text-xl font-extrabold tracking-wide text-primary-strong" data-numeric>
                  {promo}
                </div>
                <div className="mt-1 text-[10.5px] font-bold uppercase tracking-wider text-primary-strong/70">
                  {promoCaptionLabel}
                </div>
              </>
            ) : (
              <div className="text-sm text-ink-muted">···</div>
            )}
          </div>
          <div className="min-w-[160px] flex-1 space-y-1.5">
            {phone && (
              <div className="flex items-center gap-2 font-mono text-[13.5px] text-ink" data-numeric>
                <PhoneIcon />
                {phone}
              </div>
            )}
            <div className="text-xs text-ink-muted">
              {hint}
              {showSupportLink && (
                <>
                  {" "}
                  <Link href="/feedback" className="font-medium text-primary-strong underline underline-offset-2">
                    {contactSupportLabel}
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>

        <TicketDetails partner={partner} />
      </div>
    </li>
  );
}
