"use client";

import { useActionState, useTransition } from "react";
import type { Role } from "@prisma/client";
import { Button, Field, Input } from "@/components/ui";
import { ROLE_LABELS } from "@/lib/rbac";
import { deleteSlaRule, saveSlaRule, type SlaRuleFormState } from "./actions";
import { ESCALATABLE_ROLES } from "./roles";

export type SlaRuleValues = {
  id: string;
  level: number;
  afterHours: number;
  notifyRoles: Role[];
  active: boolean;
};

export function SlaRuleForm({ rule }: { rule?: SlaRuleValues }) {
  const action = saveSlaRule.bind(null, rule?.id ?? null);
  const [state, formAction, pending] = useActionState<SlaRuleFormState, FormData>(action, {});
  const [removing, startRemove] = useTransition();
  const selected = new Set(rule?.notifyRoles ?? ["APPROVER"]);

  return (
    <form action={formAction} className="rounded-xl border border-line bg-surface p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-primary-strong">
          {rule ? `Уровень ${rule.level}` : "Новый уровень"}
        </span>
        {rule && (
          <button
            type="button"
            disabled={removing}
            onClick={() => startRemove(() => deleteSlaRule(rule.id))}
            className="text-xs font-medium text-ink-muted hover:text-danger hover:underline disabled:opacity-50"
          >
            Удалить уровень
          </button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
        <Field label="Через сколько часов" htmlFor={`h-${rule?.id ?? "new"}`} required>
          <Input
            id={`h-${rule?.id ?? "new"}`}
            name="afterHours"
            type="number"
            min={1}
            defaultValue={rule?.afterHours ?? 72}
            required
          />
        </Field>

        <fieldset>
          <legend className="mb-1 block text-sm font-medium text-ink">Кому слать</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {ESCALATABLE_ROLES.map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  name={`role:${r}`}
                  defaultChecked={selected.has(r)}
                  className="h-4 w-4 rounded border-line-strong accent-[var(--primary)]"
                />
                {ROLE_LABELS[r]}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          name="active"
          defaultChecked={rule?.active ?? true}
          className="h-4 w-4 rounded border-line-strong accent-[var(--primary)]"
        />
        Уровень включён
      </label>

      <div className="mt-3 flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Сохранение…" : "Сохранить"}
        </Button>
        {state.ok && (
          <span className="text-sm font-medium text-success-strong" role="status">
            Сохранено
          </span>
        )}
        {state.error && (
          <span className="text-sm font-medium text-danger" role="alert">
            {state.error}
          </span>
        )}
      </div>
    </form>
  );
}
