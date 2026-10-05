import "server-only";
import { Prisma, type SurveyQuestionKind } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { creditCoinsTx } from "@/lib/coin-wallet";
import { getWheelSettings } from "@/lib/gamification-settings";
import { grantBonusSpins } from "@/lib/wheel";
import { checkAutoTasksForEmployee } from "@/lib/gamification-tasks";

/**
 * Опросы с вопросами и вариантами (модели Survey / SurveyQuestion / SurveyResponse).
 * Активный опрос показывается сотруднику окном при заходе на сайт; за прохождение —
 * Farovon Coins. Каждый сотрудник проходит опрос один раз (@@unique surveyId+employeeId).
 */

export const SURVEY_KINDS = ["SINGLE", "MULTI", "TEXT"] as const satisfies readonly SurveyQuestionKind[];
export const SURVEY_KIND_LABEL: Record<SurveyQuestionKind, string> = {
  SINGLE: "Один вариант",
  MULTI: "Несколько вариантов",
  TEXT: "Свой ответ (текст)",
};

const MAX_QUESTIONS = 20;
const MAX_OPTIONS = 12;
const MAX_TEXT_ANSWER = 1000;
const MAX_COINS = 10_000;

export type SurveyQuestionInput = { text: string; kind: SurveyQuestionKind; required: boolean; options: string[] };
export type SurveyInput = {
  title: string;
  description: string;
  coins: number;
  giftSpin: boolean;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  questions: SurveyQuestionInput[];
};

export class SurveyError extends Error {}

const optionsOf = (v: Prisma.JsonValue): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** Проверка и нормализация того, что прислала форма админки. */
export function validateSurveyInput(input: SurveyInput): SurveyInput {
  const title = input.title.trim();
  if (title.length < 3) throw new SurveyError("Название опроса — не короче 3 символов.");
  if (!Number.isSafeInteger(input.coins) || input.coins < 0 || input.coins > MAX_COINS) {
    throw new SurveyError(`Награда — целое число монет от 0 до ${MAX_COINS}.`);
  }
  if (input.startsAt && input.endsAt && input.endsAt <= input.startsAt) {
    throw new SurveyError("Окончание показа должно быть позже начала.");
  }
  if (input.questions.length === 0) throw new SurveyError("Добавьте хотя бы один вопрос.");
  if (input.questions.length > MAX_QUESTIONS) throw new SurveyError(`Не больше ${MAX_QUESTIONS} вопросов.`);
  const questions = input.questions.map((q, i) => {
    const text = q.text.trim();
    if (!text) throw new SurveyError(`Вопрос ${i + 1}: введите текст.`);
    if (!SURVEY_KINDS.includes(q.kind)) throw new SurveyError(`Вопрос ${i + 1}: неизвестный тип.`);
    const options = q.kind === "TEXT" ? [] : [...new Set(q.options.map((o) => o.trim()).filter(Boolean))];
    if (q.kind !== "TEXT" && options.length < 2) throw new SurveyError(`Вопрос ${i + 1}: нужно минимум 2 разных варианта.`);
    if (options.length > MAX_OPTIONS) throw new SurveyError(`Вопрос ${i + 1}: не больше ${MAX_OPTIONS} вариантов.`);
    return { text, kind: q.kind, required: q.required, options };
  });
  return { ...input, title, description: input.description.trim(), questions };
}

/** Создать (id = null) или изменить опрос. Вопросы опроса, у которого уже есть ответы, менять нельзя. */
export async function saveSurvey(actorId: string, id: string | null, raw: SurveyInput): Promise<string> {
  const input = validateSurveyInput(raw);
  const base = {
    title: input.title,
    description: input.description || null,
    coins: input.coins,
    giftSpin: input.giftSpin,
    isActive: input.isActive,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
  };
  const questionRows = input.questions.map((q, position) => ({ ...q, position }));

  if (!id) {
    const created = await db.survey.create({
      data: { ...base, createdById: actorId, questions: { create: questionRows } },
    });
    await audit({ actorId, action: "SURVEY_CREATED", entityType: "Survey", entityId: created.id, newValue: input });
    return created.id;
  }

  const existing = await db.survey.findUnique({
    where: { id },
    include: { questions: { orderBy: { position: "asc" } }, _count: { select: { responses: true } } },
  });
  if (!existing) throw new SurveyError("Опрос не найден.");
  const sameQuestions =
    JSON.stringify(existing.questions.map((q) => [q.text, q.kind, q.required, optionsOf(q.options)])) ===
    JSON.stringify(questionRows.map((q) => [q.text, q.kind, q.required, q.options]));
  if (existing._count.responses > 0 && !sameQuestions) {
    throw new SurveyError("У опроса уже есть ответы — вопросы менять нельзя, иначе результаты перепутаются. Создайте новый опрос.");
  }
  await db.$transaction([
    db.survey.update({ where: { id }, data: base }),
    ...(sameQuestions
      ? []
      : [
          db.surveyQuestion.deleteMany({ where: { surveyId: id } }),
          db.surveyQuestion.createMany({ data: questionRows.map((q) => ({ ...q, surveyId: id })) }),
        ]),
  ]);
  await audit({ actorId, action: "SURVEY_UPDATED", entityType: "Survey", entityId: id, newValue: input });
  return id;
}

export async function deleteSurvey(actorId: string, id: string): Promise<void> {
  const s = await db.survey.findUnique({ where: { id }, select: { title: true, _count: { select: { responses: true } } } });
  if (!s) return;
  if (s._count.responses > 0) throw new SurveyError("У опроса уже есть ответы — его можно только выключить.");
  await db.survey.delete({ where: { id } });
  await audit({ actorId, action: "SURVEY_DELETED", entityType: "Survey", entityId: id, oldValue: { title: s.title } });
}

/** Условие «опрос сейчас идёт». */
const liveWhere = (now: Date): Prisma.SurveyWhereInput => ({
  isActive: true,
  AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
  questions: { some: {} },
});

export type PendingSurvey = {
  id: string;
  title: string;
  description: string | null;
  coins: number;
  /** Опрос дарит прокрутку и колесо сейчас включено — то есть сотрудник её действительно получит. */
  giftSpin: boolean;
  questions: { id: string; text: string; kind: SurveyQuestionKind; required: boolean; options: string[] }[];
};

/** Первый идущий опрос, который сотрудник ещё не проходил, — для окна при заходе на сайт. */
export async function getPendingSurvey(employeeId: string): Promise<PendingSurvey | null> {
  const s = await db.survey.findFirst({
    where: { ...liveWhere(new Date()), responses: { none: { employeeId } } },
    orderBy: { createdAt: "asc" },
    include: { questions: { orderBy: { position: "asc" } } },
  });
  if (!s) return null;
  return {
    id: s.id,
    title: s.title,
    description: s.description,
    coins: s.coins,
    giftSpin: s.giftSpin && (await getWheelSettings()).wheelEnabled,
    questions: s.questions.map((q) => ({ id: q.id, text: q.text, kind: q.kind, required: q.required, options: optionsOf(q.options) })),
  };
}

export type SurveyAnswers = Record<string, string | string[]>;

/** Сохранить прохождение и начислить монеты — одной транзакцией, один раз на сотрудника. */
export async function submitSurvey(employeeId: string, surveyId: string, raw: SurveyAnswers): Promise<{ coins: number; giftSpins: number }> {
  const now = new Date();
  const survey = await db.survey.findFirst({
    where: { id: surveyId, ...liveWhere(now) },
    include: { questions: { orderBy: { position: "asc" } } },
  });
  if (!survey) throw new SurveyError("Опрос уже завершён.");

  // Принимаем только варианты, которые есть в вопросе, — ответ приходит от клиента.
  const answers: SurveyAnswers = {};
  for (const q of survey.questions) {
    const options = optionsOf(q.options);
    const v = raw[q.id];
    if (q.kind === "TEXT") {
      const text = typeof v === "string" ? v.trim().slice(0, MAX_TEXT_ANSWER) : "";
      if (text) answers[q.id] = text;
    } else if (q.kind === "SINGLE") {
      if (typeof v === "string" && options.includes(v)) answers[q.id] = v;
    } else {
      const picked = Array.isArray(v) ? [...new Set(v.filter((x) => options.includes(x)))] : [];
      if (picked.length) answers[q.id] = picked;
    }
    if (q.required && answers[q.id] === undefined) throw new SurveyError(`Ответьте на вопрос: «${q.text}»`);
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.surveyResponse.create({ data: { surveyId, employeeId, answers, coins: survey.coins } });
      if (survey.coins > 0) {
        await creditCoinsTx(tx, {
          employeeId,
          amount: survey.coins,
          reason: `Опрос «${survey.title}»`,
          opKey: `survey:${surveyId}:${employeeId}`,
        });
      }
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new SurveyError("Вы уже прошли этот опрос — спасибо!");
    }
    throw e;
  }
  await checkAutoTasksForEmployee(employeeId, "SURVEYS_COMPLETED").catch(() => {});
  // Прокрутка — только пока колесо включено; opKey не даёт выдать её дважды.
  const giftSpins =
    survey.giftSpin && (await getWheelSettings()).wheelEnabled
      ? await grantBonusSpins({
          employeeId,
          count: 1,
          reason: `Опрос «${survey.title}»`,
          opKey: `survey:${surveyId}:${employeeId}`,
        })
      : 0;
  return { coins: survey.coins, giftSpins };
}

export type SurveyResults = {
  total: number;
  questions: {
    id: string;
    text: string;
    kind: SurveyQuestionKind;
    /** Для SINGLE/MULTI: вариант → сколько выбрали. */
    counts: { option: string; count: number }[];
    answered: number;
    /** Для TEXT: последние ответы. */
    texts: string[];
  }[];
};

/** Сводка ответов для админки: сколько выбрали каждый вариант, тексты свободных ответов. */
export async function loadSurveyResults(surveyId: string): Promise<SurveyResults> {
  const [questions, responses] = await Promise.all([
    db.surveyQuestion.findMany({ where: { surveyId }, orderBy: { position: "asc" } }),
    db.surveyResponse.findMany({ where: { surveyId }, orderBy: { createdAt: "desc" }, select: { answers: true } }),
  ]);
  return {
    total: responses.length,
    questions: questions.map((q) => {
      const values = responses.map((r) => (r.answers as SurveyAnswers)[q.id]).filter((v) => v !== undefined);
      const flat = values.flatMap((v) => (Array.isArray(v) ? v : [v]));
      return {
        id: q.id,
        text: q.text,
        kind: q.kind,
        answered: values.length,
        counts: optionsOf(q.options).map((option) => ({ option, count: flat.filter((x) => x === option).length })),
        texts: q.kind === "TEXT" ? (flat as string[]).slice(0, 200) : [],
      };
    }),
  };
}
