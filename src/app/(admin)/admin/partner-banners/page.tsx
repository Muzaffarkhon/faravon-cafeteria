"use client";
import { useState, useEffect } from "react";
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Table } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ImageUploadField } from "@/app/(app)/_components/image-upload-field";

const BANNER_ASPECT = 4.5; // совпадает с рамкой карусели на широком экране

type Banner = {
  id: string;
  partnerId?: string | null;
  kind?: "PARTNER" | "NEWS";
  title: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  href?: string | null;
  androidUrl?: string | null;
  iosUrl?: string | null;
  isActive: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
};

export default function Page() {
  const [banners, setBanners] = useState<Banner[] | null>(null);
  const [form, setForm] = useState<Partial<Banner>>({ isActive: true, kind: "PARTNER" });
  const [saving, setSaving] = useState(false);
  const editing = !!form.id;

  useEffect(() => {
    fetch("/api/partner-banner")
      .then((r) => r.json())
      .then((list: Banner[]) => {
        setBanners(list);
        // ?new=<id> — пришли после одобрения заявки на рекламу: открываем черновик на правку.
        const newId = new URLSearchParams(window.location.search).get("new");
        const draft = newId ? list.find((b) => b.id === newId) : undefined;
        if (draft) setForm({ ...draft });
      })
      .catch(() => setBanners([]));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const method = form.id ? "PUT" : "POST";
    try {
      const res = await fetch("/api/partner-banner", {
        method,
        body: JSON.stringify(form),
        headers: { "content-type": "application/json" },
      });
      const data = await res.json();
      setForm({ isActive: true, kind: "PARTNER" });
      setBanners((s) => {
        const list = s ?? [];
        return method === "POST" ? [data, ...list] : list.map((b) => (b.id === data.id ? data : b));
      });
    } finally {
      setSaving(false);
    }
  }

  const [removeId, setRemoveId] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const removeTarget = (banners ?? []).find((b) => b.id === removeId) ?? null;

  async function remove(id: string) {
    setRemoving(true);
    try {
      await fetch("/api/partner-banner", {
        method: "DELETE",
        body: JSON.stringify({ id }),
        headers: { "content-type": "application/json" },
      });
      setBanners((s) => (s ?? []).filter((b) => b.id !== id));
      setRemoveId(null);
    } finally {
      setRemoving(false);
    }
  }

  const set =
    (k: "title" | "partnerId" | "href" | "subtitle" | "androidUrl" | "iosUrl") =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Баннеры"
        description="Промо-блоки и новости, которые видит сотрудник в обзоре личного кабинета."
      />

      <Card className="p-5">
        <div className="text-sm font-semibold text-ink">
          {editing ? "Редактирование баннера" : "Новый баннер"}
        </div>
        <form onSubmit={save} className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Заголовок" htmlFor="b-title" required>
            <Input id="b-title" value={form.title ?? ""} onChange={set("title")} required />
          </Field>
          <Field label="Тип баннера" htmlFor="b-kind">
            <select
              id="b-kind"
              value={form.kind ?? "PARTNER"}
              onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as Banner["kind"] }))}
              className="w-full rounded-[10px] border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary"
            >
              <option value="PARTNER">Партнёр (реклама)</option>
              <option value="NEWS">Своя новость / анонс</option>
            </select>
          </Field>
          <Field
            label="ID партнёра"
            htmlFor="b-partner"
            hint={form.kind === "NEWS" ? "Для новостей компании не требуется." : undefined}
          >
            <Input
              id="b-partner"
              value={form.partnerId ?? ""}
              onChange={set("partnerId")}
              autoComplete="off"
              disabled={form.kind === "NEWS"}
              placeholder={form.kind === "NEWS" ? "Не требуется" : ""}
            />
          </Field>
          <Field label="Подзаголовок" htmlFor="b-subtitle" className="sm:col-span-2">
            <Input id="b-subtitle" value={form.subtitle ?? ""} onChange={set("subtitle")} />
          </Field>
          <div className="sm:col-span-2">
            <ImageUploadField
              value={form.imageUrl ?? ""}
              onChange={(url) => setForm((f) => ({ ...f, imageUrl: url }))}
              purpose="banner"
              aspect={BANNER_ASPECT}
              label="Изображение баннера"
              hint="Загрузите фото и скадрируйте под баннер, либо вставьте ссылку."
            />
          </div>
          <Field label="Ссылка" htmlFor="b-href" hint="Куда ведёт клик по баннеру, если ссылки на приложение не заданы.">
            <Input id="b-href" inputMode="url" value={form.href ?? ""} onChange={set("href")} />
          </Field>
          <Field label="Приложение · Android" htmlFor="b-android" hint="Google Play или .apk. Клик по баннеру на Android ведёт сюда.">
            <Input id="b-android" inputMode="url" value={form.androidUrl ?? ""} onChange={set("androidUrl")} placeholder="https://play.google.com/…" />
          </Field>
          <Field label="Приложение · iOS" htmlFor="b-ios" hint="App Store. Клик по баннеру на iPhone/iPad ведёт сюда.">
            <Input id="b-ios" inputMode="url" value={form.iosUrl ?? ""} onChange={set("iosUrl")} placeholder="https://apps.apple.com/…" />
          </Field>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={!!form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              className="h-4 w-4 rounded border-line-strong accent-[var(--primary)]"
            />
            Активен
          </label>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Button type="submit" loading={saving}>
              {editing ? "Сохранить" : "Добавить"}
            </Button>
            {editing && (
              <Button type="button" variant="ghost" onClick={() => setForm({ isActive: true, kind: "PARTNER" })}>
                Отмена
              </Button>
            )}
          </div>
        </form>
      </Card>

      {banners === null ? (
        <Card className="p-6 text-sm text-ink-muted">Загрузка…</Card>
      ) : banners.length === 0 ? (
        <EmptyState>Баннеров пока нет.</EmptyState>
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <th>Заголовок</th>
                <th>Тип</th>
                <th>Партнёр</th>
                <th>Статус</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {banners.map((b) => (
                <tr key={b.id}>
                  <td className="font-medium text-ink">{b.title}</td>
                  <td>
                    <Badge tone={b.kind === "NEWS" ? "brand" : "neutral"}>
                      {b.kind === "NEWS" ? "Новость" : "Партнёр"}
                    </Badge>
                  </td>
                  <td className="text-ink-muted">{b.kind === "NEWS" ? "—" : (b.partnerId ?? "—")}</td>
                  <td>
                    <Badge tone={b.isActive ? "success" : "neutral"}>
                      {b.isActive ? "Активен" : "Выключен"}
                    </Badge>
                  </td>
                  <td>
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" size="sm" onClick={() => setForm({ ...b })}>
                        Изменить
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => setRemoveId(b.id)}>
                        Удалить
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      <ConfirmDialog
        open={!!removeId}
        title="Удалить баннер?"
        message={
          removeTarget ? <>«{removeTarget.title}» будет удалён безвозвратно.</> : undefined
        }
        confirmLabel="Удалить"
        tone="danger"
        busy={removing}
        onConfirm={() => removeId && remove(removeId)}
        onClose={() => setRemoveId(null)}
      />
    </div>
  );
}
