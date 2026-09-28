"use client";

import { useActionState, useEffect, useId, useState, useTransition } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { saveWheelSettings, saveWheelSector, deleteWheelSector } from "./actions";

function FormStatus({ state }: { state: { ok?: boolean; error?: string } }) {
  if (state.error) {
    return (
      <p className="rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger" role="alert">
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return (
      <span className="text-sm font-medium text-success-strong" role="status">
        Сохранено
      </span>
    );
  }
  return null;
}

export function WheelSettingsForm({ enabled, spinCost }: { enabled: boolean; spinCost: number }) {
  const [state, formAction, pending] = useActionState(saveWheelSettings, {});
  return (
    <form action={formAction} className="space-y-4 rounded-xl border border-line bg-surface p-4 shadow-sm">
      <label className="flex items-start gap-2.5 text-sm font-semibold text-ink">
        <input
          type="checkbox"
          name="wheelEnabled"
          defaultChecked={enabled}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-line-strong accent-[var(--primary)]"
        />
        <span>
          Показывать колесо сотрудникам
          <span className="mt-1 block max-w-sm text-xs font-normal text-ink-muted">
            Работает, только когда включена сама геймификация. Каждый сотрудник крутит один раз в сутки (по Душанбе).
          </span>
        </span>
      </label>
      <div className="flex flex-wrap items-end gap-4 border-t border-line-subtle pt-4">
        <Field label="Цена прокрутки, монет" htmlFor="wheelSpinCost" hint="0 — бесплатно" className="w-44">
          <Input id="wheelSpinCost" name="wheelSpinCost" type="number" min={0} step={1} defaultValue={spinCost} />
        </Field>
        <Button type="submit" size="sm" variant="secondary" loading={pending}>
          Сохранить
        </Button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}

export type SectorFormValue = {
  id: string;
  position: number;
  kind: "COUPON" | "COINS" | "NOTHING";
  label: string | null;
  weight: number;
  coins: number | null;
  cardId: string | null;
  quantity: number | null;
  wonCount: number;
};

export function WheelSectorForm({
  sector,
  cards,
  nextPosition,
  onSaved,
}: {
  sector?: SectorFormValue;
  cards: { id: string; title: string; partnerName: string | null }[];
  nextPosition: number;
  onSaved?: () => void;
}) {
  const uid = useId();
  const [state, formAction, pending] = useActionState(saveWheelSector.bind(null, sector?.id ?? null), {});
  const [kind, setKind] = useState<string>(sector?.kind ?? "COUPON");
  const id = (name: string) => `${uid}-${name}`;

  useEffect(() => {
    if (state.ok) onSaved?.();
  }, [state, onSaved]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Что в листке" htmlFor={id("kind")}>
          <Select id={id("kind")} name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="COUPON">Купон льготы</option>
            <option value="COINS">Farovon Coin</option>
            <option value="NOTHING">Без приза («повезёт завтра»)</option>
          </Select>
        </Field>
        <Field label="Место на колесе" htmlFor={id("position")} hint="1 — под стрелкой, дальше по часовой">
          <Input id={id("position")} name="position" type="number" min={1} step={1} defaultValue={sector?.position ?? nextPosition} required />
        </Field>
        <Field label="Вес шанса" htmlFor={id("weight")} hint="Чем больше, тем чаще выпадает; 0 — никогда">
          <Input id={id("weight")} name="weight" type="number" min={0} step={1} defaultValue={sector?.weight ?? 10} required />
        </Field>
      </div>

      {kind === "COUPON" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Льгота" htmlFor={id("cardId")} className="sm:col-span-2" required>
            <Select id={id("cardId")} name="cardId" defaultValue={sector?.cardId ?? ""} required>
              <option value="" disabled>
                Выберите льготу
              </option>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                  {c.partnerName ? ` — ${c.partnerName}` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Сколько человек могут выиграть"
            htmlFor={id("quantity")}
            hint={sector?.wonCount ? `Уже выиграно: ${sector.wonCount}` : undefined}
            required
          >
            <Input id={id("quantity")} name="quantity" type="number" min={Math.max(1, sector?.wonCount ?? 0)} step={1} defaultValue={sector?.quantity ?? 10} required />
          </Field>
        </div>
      )}
      {kind === "COINS" && (
        <Field label="Сколько монет" htmlFor={id("coins")} className="w-48" required>
          <Input id={id("coins")} name="coins" type="number" min={1} step={1} defaultValue={sector?.coins ?? 5} required />
        </Field>
      )}
      <Field label="Подпись на листке" htmlFor={id("label")} hint="Необязательно, до 40 символов. По умолчанию — название льготы или «+N»">
        <Input id={id("label")} name="label" maxLength={40} defaultValue={sector?.label ?? ""} />
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" loading={pending}>
          {sector ? "Сохранить листок" : "Добавить листок"}
        </Button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}

export function EditWheelSector(props: {
  sector: SectorFormValue;
  cards: { id: string; title: string; partnerName: string | null }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" size="sm" variant="secondary" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {open ? "Скрыть" : "Изменить"}
      </Button>
      {open && (
        <div className="mt-3 rounded-xl border border-line bg-surface-muted p-4 text-left">
          <WheelSectorForm {...props} nextPosition={props.sector.position} onSaved={() => setOpen(false)} />
        </div>
      )}
    </>
  );
}

export function DeleteWheelSectorButton({ sectorId, label }: { sectorId: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button type="button" size="sm" variant="danger" onClick={() => setOpen(true)}>
        Удалить
      </Button>
      {error && (
        <span className="ml-2 text-xs font-medium text-danger" role="alert">
          {error}
        </span>
      )}
      <ConfirmDialog
        open={open}
        tone="danger"
        busy={busy}
        title="Удалить листок?"
        message={`«${label}» пропадёт с колеса. Уже выигранные призы и история прокруток сохранятся.`}
        confirmLabel="Удалить"
        onConfirm={() =>
          start(async () => {
            const r = await deleteWheelSector(sectorId);
            setError(r.error ?? null);
            setOpen(false);
          })
        }
        onClose={() => setOpen(false)}
      />
    </>
  );
}
