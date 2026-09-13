import type {
  Block,
  CardStatus,
  EmploymentStatus,
  PartnerStatus,
  PeriodStatus,
} from "@prisma/client";
import { translate, type TKey } from "./i18n/dict";
import type { Locale } from "./i18n/shared";

export const BLOCK_LABELS: Record<Block, string> = {
  RECOGNITION: "Программы признания",
  CARE: "Витрина заботы",
  FLEX: "Реестр гибких льгот",
};

export const PARTNER_STATUS_LABELS: Record<PartnerStatus, string> = {
  ACTIVE: "Активен",
  SOON: "Скоро",
  ARCHIVED: "Архив",
};

export const CARD_STATUS_LABELS: Record<CardStatus, string> = {
  DRAFT: "Черновик",
  PUBLISHED: "Опубликовано",
};

export const PERIOD_STATUS_LABELS: Record<PeriodStatus, string> = {
  DRAFT: "Черновик",
  OPEN: "Открыт",
  CLOSED: "Закрыт",
};

export const EMPLOYMENT_STATUS_LABELS: Record<EmploymentStatus, string> = {
  ACTIVE: "Работает",
  PROBATION: "Испытательный срок",
  TERMINATED: "Уволен",
};

export const BLOCKS: Block[] = ["RECOGNITION", "CARE", "FLEX"];
export const PARTNER_STATUSES: PartnerStatus[] = ["ACTIVE", "SOON", "ARCHIVED"];
export const CARD_STATUSES: CardStatus[] = ["DRAFT", "PUBLISHED"];

export const blockLabel = (locale: Locale, block: Block): string =>
  translate(locale, `block.${block}` as TKey);
export const partnerStatusLabel = (locale: Locale, status: PartnerStatus): string =>
  translate(locale, `status.partner.${status}` as TKey);
export const cardStatusLabel = (locale: Locale, status: CardStatus): string =>
  translate(locale, `status.card.${status}` as TKey);
export const periodStatusLabel = (locale: Locale, status: PeriodStatus): string =>
  translate(locale, `status.period.${status}` as TKey);
export const employmentStatusLabel = (locale: Locale, status: EmploymentStatus): string =>
  translate(locale, `status.employment.${status}` as TKey);
