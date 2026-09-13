import type { Role } from "@prisma/client";
import { can } from "@/lib/rbac";
import type { NavGroup, NavItem } from "./_shell";

/**
 * Единый список разделов платформы: и меню «Ещё» в шапке, и плитки «Кабинета»
 * строятся отсюда, поэтому раздел нельзя добавить в одно место и забыть про
 * другое. Подпись `desc` показывают только плитки — в меню для неё нет места.
 */

export const ICONS = {
  overview: "M4 4h7v7H4z||M13 4h7v7h-7z||M4 13h7v7H4z||M13 13h7v7h-7z",
  applications: "M6 2h12v20l-3-2-3 2-3-2-3 2z||M9 8h6||M9 12h6",
  gamification:
    "M8 21h8||M12 17v4||M7 4h10v5a5 5 0 0 1-10 0z||M17 5h2a2 2 0 0 1 0 4h-2||M7 5H5a2 2 0 0 0 0 4h2",
  review: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z||M9 12l2 2 4-4",
  coupons:
    "M4 9V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 6v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-6z||M12 7v10",
  scan: "M3 7V5a2 2 0 0 1 2-2h2||M17 3h2a2 2 0 0 1 2 2v2||M21 17v2a2 2 0 0 1-2 2h-2||M7 21H5a2 2 0 0 1-2-2v-2||M7 12h10",
  ad: "M3 11l14-7v16L3 13z||M3 11v3||M17 8a3 3 0 0 1 0 8",
  cards: "M12 3l9 5-9 5-9-5z||M3 13l9 5 9-5||M3 17l9 5 9-5",
  partners: "M4 21h16||M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16||M9 8h1||M9 12h1||M14 8h1||M14 12h1",
  banners:
    "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z||M8.5 10.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z||M21 15l-5-5L6 19",
  inbox: "M4 13h4l2 3h4l2-3h4||M4 13l2-7h12l2 7||M4 13v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5",
  texts: "M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z||M14 2v6h6||M8 13h8||M8 17h6",
  bell: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9||M10.3 21a2 2 0 0 0 3.4 0",
  reports: "M4 20V10||M10 20V4||M16 20v-7||M2 20h20",
  sla: "M12 8v5l3 2||M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z||M9 3h6",
  periods: "M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z||M4 10h16||M8 3v4||M16 3v4",
  access: "M14 7a4 4 0 1 0-3.5 3.97L4 17v3h3l1-1h2v-2h2l1.5-1.5A4 4 0 0 0 14 7z",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z||M3 21v-1a6 6 0 0 1 12 0v1||M17 11a3 3 0 1 0 0-6||M21 21v-1a5 5 0 0 0-4-4.9",
  history: "M3 12a9 9 0 1 0 3-6.7L3 8||M3 3v5h5||M12 8v5l3 2",
  chat: "M4 4h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-4 4v-4H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z||M8 9h8||M8 12h5",
};

/** Счётчики непрочитанного/несделанного. Плиткам «Кабинета» они не нужны. */
export type NavBadges = {
  review?: number;
  coupons?: number;
  adRequests?: number;
  myCoupons?: number;
  partnerCoupons?: number;
  feedback?: number;
  support?: number;
};

export type NavContext = {
  roles: Role[];
  hasEmployee: boolean;
  partnerId: string | null;
  /** Подрядчик со своей системой (такси): вместо кассы — рассылка промокодов. */
  isTaxiContractor: boolean;
  badges?: NavBadges;
};

export function buildNavGroups(ctx: NavContext): NavGroup[] {
  const { roles, hasEmployee, partnerId, isTaxiContractor } = ctx;
  const b = ctx.badges ?? {};

  const groups: NavGroup[] = [];
  const add = (gid: string, glabel: string, item: NavItem) => {
    let g = groups.find((x) => x.id === gid);
    if (!g) {
      g = { id: gid, label: glabel, items: [] };
      groups.push(g);
    }
    g.items.push(item);
  };

  const canDecide = can(roles, "applications.decide");
  const canManageCoupons = can(roles, "coupons.manage");
  const canManageCards = can(roles, "cards.manage");
  const canConfirmCoupons = can(roles, "coupons.confirm");
  const canManageFeedback = can(roles, "feedback.manage");

  if (hasEmployee) {
    add("cabinet", "Кабинет", {
      href: "/",
      label: "Обзор",
      desc: "витрина льгот и выбор на текущий период",
      icon: ICONS.overview,
    });
    add("cabinet", "Кабинет", {
      href: "/applications",
      label: "Мои заявки и купоны",
      desc: "история выбора и выданные купоны",
      icon: ICONS.applications,
      badge: b.myCoupons || undefined,
    });
    add("cabinet", "Кабинет", {
      href: "/feedback",
      label: "Обратная связь",
      desc: "вопрос или предложение по программе льгот",
      icon: ICONS.inbox,
    });
    add("cabinet", "Кабинет", {
      href: "/gamification",
      label: "Геймификация",
      desc: "баллы и достижения",
      icon: ICONS.gamification,
      soon: true,
    });
  }

  if (canDecide)
    add("work", "Работа", {
      href: "/review",
      label: "Согласование",
      desc: "одобрение и отклонение позиций",
      icon: ICONS.review,
      badge: b.review || undefined,
    });
  if (canManageCoupons)
    add("work", "Работа", {
      href: "/coupons",
      label: "Купоны",
      desc: "формирование и выдача купонов",
      icon: ICONS.coupons,
      badge: b.coupons || undefined,
    });
  if (isTaxiContractor)
    add("work", "Работа", {
      href: "/provider/taxi",
      label: "Промокоды",
      desc: "выгрузка номеров и рассылка промокодов",
      icon: ICONS.coupons,
    });
  else if (canConfirmCoupons)
    add("work", "Работа", {
      href: "/provider",
      label: "Касса партнёра",
      desc: "проверка и активация купонов сотрудников",
      icon: ICONS.scan,
      badge: b.partnerCoupons || undefined,
    });
  if (canConfirmCoupons && partnerId)
    add("work", "Работа", {
      href: "/advertising",
      label: "Реклама",
      desc: "заявки на рекламу вашей организации",
      icon: ICONS.ad,
    });

  if (canManageCards)
    add("catalog", "Каталог", {
      href: "/admin/cards",
      label: "Карточки",
      desc: "программы признания, витрина заботы, реестр гибких льгот",
      icon: ICONS.cards,
    });
  if (can(roles, "partners.manage"))
    add("catalog", "Каталог", {
      href: "/admin/partners",
      label: "Партнёры",
      desc: "организации-провайдеры льгот",
      icon: ICONS.partners,
    });
  if (can(roles, "partners.manage"))
    add("catalog", "Каталог", {
      href: "/admin/partner-banners",
      label: "Баннеры",
      desc: "карусель на витрине сотрудника",
      icon: ICONS.banners,
    });
  if (canManageCards)
    add("catalog", "Каталог", {
      href: "/admin/advertising-requests",
      label: "Заявки на рекламу",
      desc: "обращения партнёров о размещении",
      icon: ICONS.inbox,
      badge: b.adRequests || undefined,
    });
  if (canManageCards)
    add("catalog", "Каталог", {
      href: "/admin/texts",
      label: "Тексты",
      desc: "«Цель программы» и уведомление о новизне",
      icon: ICONS.texts,
    });
  if (canManageCards)
    add("catalog", "Каталог", {
      href: "/admin/notifications",
      label: "Уведомления",
      desc: "шаблоны сообщений в Telegram",
      icon: ICONS.bell,
    });

  if (canManageFeedback)
    add("admin", "Аналитика и доступ", {
      href: "/admin/feedback",
      label: "Обратная связь",
      desc: "обращения сотрудников по программе льгот",
      icon: ICONS.inbox,
      badge: b.feedback || undefined,
    });
  if (can(roles, "support.manage"))
    add("admin", "Аналитика и доступ", {
      href: "/admin/support",
      label: "Чат поддержки",
      desc: "когда бот не смог опознать человека при входе",
      icon: ICONS.chat,
      badge: b.support || undefined,
    });
  if (can(roles, "reports.view"))
    add("admin", "Аналитика и доступ", {
      href: "/admin/reports",
      label: "Отчёты",
      desc: "активация, вовлечение, конверсия, топ льгот, экспорт XLSX",
      icon: ICONS.reports,
    });
  if (canManageCards)
    add("admin", "Аналитика и доступ", {
      href: "/admin/sla",
      label: "SLA",
      desc: "сроки согласования и правила эскалации",
      icon: ICONS.sla,
    });
  if (can(roles, "periods.manage"))
    add("admin", "Аналитика и доступ", {
      href: "/admin/periods",
      label: "Периоды",
      desc: "окна подачи заявок, лимит, открытие и закрытие",
      icon: ICONS.periods,
    });
  if (can(roles, "access.manage"))
    add("admin", "Аналитика и доступ", {
      href: "/admin/access",
      label: "Доступ",
      desc: "коды идентификации для Telegram-бота, привязка Telegram",
      icon: ICONS.access,
    });
  if (can(roles, "users.manage"))
    add("admin", "Аналитика и доступ", {
      href: "/admin/users",
      label: "Пользователи",
      desc: "справочник сотрудников, учётные записи, роли, архив",
      icon: ICONS.users,
    });
  if (can(roles, "audit.view"))
    add("admin", "Аналитика и доступ", {
      href: "/admin/audit",
      label: "Аудит",
      desc: "история действий: кто, что и когда изменял, согласования, входы",
      icon: ICONS.history,
    });

  return groups;
}
