"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { Role } from "@prisma/client";
import { ALL_PERMISSIONS, PERMISSION_LABELS, ROLE_LABELS, type Permission } from "@/lib/rbac";
import { Button, Card } from "@/components/ui";
import { ALL_ROLES } from "../users/roles";
import { saveRbacMatrix } from "./actions";

export function MatrixForm({ allowed }: { allowed: Record<Permission, Role[]> }) {
  const [state, formAction, pending] = useActionState(saveRbacMatrix, {});
  const [dirty, setDirty] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) {
      setJustSaved(true);
      setDirty(false);
    }
    wasPending.current = pending;
  }, [pending, state.error]);

  return (
    <form
      action={formAction}
      onChange={() => {
        setDirty(true);
        setJustSaved(false);
      }}
      className="space-y-3"
    >
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line-subtle text-left text-xs text-ink-muted">
              <th className="px-4 py-2 font-medium">Право</th>
              {ALL_ROLES.map((r) => (
                <th key={r} className="px-4 py-2 text-center font-medium whitespace-nowrap">
                  {ROLE_LABELS[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {ALL_PERMISSIONS.map((p) => (
              <tr key={p}>
                <td className="px-4 py-2 text-ink">
                  {PERMISSION_LABELS[p]}
                  <span className="ml-1.5 font-mono text-[11px] text-ink-subtle">{p}</span>
                </td>
                {ALL_ROLES.map((r) => (
                  <td key={r} className="px-4 py-2 text-center">
                    <input
                      type="checkbox"
                      name={`p:${r}:${p}`}
                      defaultChecked={allowed[p].includes(r)}
                      aria-label={`${PERMISSION_LABELS[p]} — ${ROLE_LABELS[r]}`}
                      className="h-4 w-4 accent-[var(--primary)]"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending} disabled={!dirty}>
          Сохранить матрицу
        </Button>
        {state.error && (
          <span className="text-sm font-medium text-danger" role="alert">
            {state.error}
          </span>
        )}
        {justSaved && !state.error && (
          <span className="text-sm font-medium text-success-strong">Матрица сохранена.</span>
        )}
      </div>
    </form>
  );
}
