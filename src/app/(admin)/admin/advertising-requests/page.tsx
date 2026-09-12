"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, EmptyState, Table, type BadgeTone } from "@/components/ui";

type Req = {
  id: string;
  companyName: string;
  contactName: string;
  contactPhone: string;
  productName: string;
  productDescription: string;
  androidUrl?: string | null;
  iosUrl?: string | null;
  status: string;
  submittedAt: string;
};

const STATUS_TONE: Record<string, BadgeTone> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "brand",
};
const STATUS_LABEL: Record<string, string> = {
  PENDING: "На рассмотрении",
  APPROVED: "Одобрена",
  REJECTED: "Отклонена",
};

export default function Page() {
  const router = useRouter();
  const [items, setItems] = useState<Req[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/advertising/admin")
      .then((r) => r.json())
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  async function updateStatus(id: string, status: string) {
    setBusyId(id);
    const form = new FormData();
    form.set("id", id);
    form.set("status", status);
    try {
      const res = await fetch("/api/advertising/admin", { method: "POST", body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        alert(data?.error ?? "Не удалось изменить статус заявки.");
        return;
      }
      setItems((s) => (s ?? []).map((it) => (it.id === id ? { ...it, status } : it)));
      router.refresh(); // обновить счётчик в меню
      // После одобрения — сразу в баннеры, там уже создан черновик с данными заявки.
      if (status === "APPROVED" && data?.bannerId) {
        router.push(`/admin/partner-banners?new=${data.bannerId}`);
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      {items === null ? (
        <Card className="p-6 text-sm text-ink-muted">Загрузка…</Card>
      ) : items.length === 0 ? (
        <EmptyState>Заявок пока нет.</EmptyState>
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <th>Компания / контакт</th>
                <th>Продукт</th>
                <th>Приложение</th>
                <th>Статус</th>
                <th>Подана</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="font-medium text-ink">{r.companyName}</div>
                    <div className="text-xs text-ink-subtle">
                      {r.contactName} · <span data-numeric>{r.contactPhone}</span>
                    </div>
                  </td>
                  <td>
                    <div className="text-ink">{r.productName}</div>
                    <div className="text-xs text-ink-subtle line-clamp-1">{r.productDescription}</div>
                  </td>
                  <td className="text-xs">
                    {r.androidUrl || r.iosUrl ? (
                      <div className="flex flex-col gap-0.5">
                        {r.androidUrl && (
                          <a href={r.androidUrl} target="_blank" rel="noopener noreferrer" className="text-primary-strong underline">
                            Android
                          </a>
                        )}
                        {r.iosUrl && (
                          <a href={r.iosUrl} target="_blank" rel="noopener noreferrer" className="text-primary-strong underline">
                            iOS
                          </a>
                        )}
                      </div>
                    ) : (
                      <span className="text-ink-subtle">—</span>
                    )}
                  </td>
                  <td>
                    <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </Badge>
                  </td>
                  <td data-numeric>{new Date(r.submittedAt).toLocaleDateString("ru-RU")}</td>
                  <td>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="success"
                        size="sm"
                        loading={busyId === r.id}
                        disabled={r.status === "APPROVED"}
                        onClick={() => updateStatus(r.id, "APPROVED")}
                      >
                        Одобрить
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={busyId === r.id || r.status === "REJECTED" || r.status === "APPROVED"}
                        onClick={() => updateStatus(r.id, "REJECTED")}
                      >
                        Отклонить
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
