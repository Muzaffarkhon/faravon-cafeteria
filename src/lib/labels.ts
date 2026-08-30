import type { Block, CardStatus, PartnerStatus, PeriodStatus } from "@prisma/client";

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

export const BLOCKS: Block[] = ["RECOGNITION", "CARE", "FLEX"];
export const PARTNER_STATUSES: PartnerStatus[] = ["ACTIVE", "SOON", "ARCHIVED"];
export const CARD_STATUSES: CardStatus[] = ["DRAFT", "PUBLISHED"];
