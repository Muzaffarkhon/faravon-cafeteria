"use client";
import { useEffect, useState } from "react";
import { Badge, Button, Card, EmptyState, PageHeader, Table, type BadgeTone } from "@/components/ui";

type Req = {
  id: string;
  companyName: string;
  contactName: string;
  contactPhone: string;
  productName: string;
  productDescription: string;
  budget?: string | null;
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
      await fetch("/api/advertising/admin", { method: "POST", body: form });
      setItems((s) => (s ?? []).map((it) => (it.id === id ? { ...it, status } : it)));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Заявки на рекламу"
        description="Обращения компаний, желающих разместить рекламу партнёра."
      />

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
                <th>Бюджет</th>
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
                  <td data-numeric>{r.budget ?? "—"}</td>
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
                        disabled={busyId === r.id || r.status === "REJECTED"}
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
