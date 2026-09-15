"use client";

import { useMemo, useState, useTransition } from "react";
import { Badge, Button, RowId, Table, Textarea } from "@/components/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import { approveItem, bulkApprove, bulkReject, rejectItem, type BulkResult } from "./actions";

export type ReviewRow = {
  id: string;
  seq: number;
  employee: string;
  department: string;
  phone: string | null;
  card: string;
  partner: string | null;
  condition: string | null;
  period: string;
  submittedAt: string | null;
  overdue: boolean;
};

const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("ru-RU") : "—");

export function ReviewTable({ rows, locale }: { rows: ReviewRow[]; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [bulkComment, setBulkComment] = useState("");
  const [result, setResult] = useState<BulkResult | null>(null);
  const [rowErr, setRowErr] = useState<Record<string, string>>({});
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectText, setRejectText] = useState("");
  const [approveId, setApproveId] = useState<string | null>(null);
  const approveRow = rows.find((r) => r.id === approveId) ?? null;
  const [confirmBulkApprove, setConfirmBulkApprove] = useState(false);

  const allIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const allChecked = sel.size > 0 && allIds.every((id) => sel.has(id));

  function toggle(id: string) {
    setResult(null);
    setSel((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setResult(null);
    setSel(allChecked ? new Set() : new Set(allIds));
  }

  function runRow(id: string, fn: () => Promise<{ error?: string }>) {
    setRowErr((e) => ({ ...e, [id]: "" }));
    start(async () => {
      try {
        const r = await fn();
        if (r?.error) {
          setRowErr((prev) => ({ ...prev, [id]: r.error! }));
          return;
        }
        setRejectingId(null);
        setRejectText("");
      } catch (e) {
        setRowErr((prev) => ({ ...prev, [id]: e instanceof Error ? e.message : "Ошибка" }));
      }
    });
  }

  function runBulk(kind: "approve" | "reject") {
    const ids = [...sel];
    if (ids.length === 0) return;
    setResult(null);
    start(async () => {
      const r =
        kind === "approve" ? await bulkApprove(ids) : await bulkReject(ids, bulkComment);
      setResult(r);
      if (r.ok > 0) {
        setSel(new Set());
        setBulkComment("");
      }
    });
  }

  return (
    <div className="space-y-3">
      {sel.size > 0 && (
        <div className="sticky top-16 z-10 space-y-2 rounded-lg border border-line bg-surface p-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-ink">{t("review.selectedCount")}: {sel.size}</span>
            <Button
              variant="success"
              size="sm"
              disabled={pending}
              onClick={() => setConfirmBulkApprove(true)}
            >
              {t("review.approveSelected")}
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={pending || bulkComment.trim().length < 3}
              onClick={() => runBulk("reject")}
            >
              {t("review.rejectSelected")}
            </Button>
            <button
              type="button"
              className="text-xs text-ink-muted hover:text-ink hover:underline"
              onClick={() => setSel(new Set())}
            >
              {t("review.clearSelection")}
            </button>
          </div>
          <Textarea
            value={bulkComment}
            onChange={(e) => setBulkComment(e.target.value)}
            rows={2}
            placeholder={t("review.rejectReasonBulkPlaceholder")}
          />
        </div>
      )}

      {result && (
        <p
          className="rounded-md bg-surface-muted px-3 py-2 text-sm text-ink"
          role="status"
        >
          {t("review.processed")}: {result.ok}
          {result.failed > 0 && `, ${t("review.withError")}: ${result.failed}`}
          {result.errors.length > 0 && ` — ${result.errors.join("; ")}`}
        </p>
      )}

      <div className="overflow-hidden rounded-[18px] bg-surface shadow-sm">
        <Table stickyHeader>
          <thead>
            <tr>
              <th className="w-8">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  aria-label={t("review.selectAllOnPage")}
                  className="h-4 w-4 accent-[var(--primary)]"
                />
              </th>
              <th>{t("review.colId")}</th>
              <th>{t("review.colEmployee")}</th>
              <th>{t("review.colCardPartner")}</th>
              <th>{t("review.colPeriod")}</th>
              <th>{t("review.colSubmitted")}</th>
              <th className="text-right">{t("review.colActions")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="align-top">
                <td>
                  <input
                    type="checkbox"
                    checked={sel.has(r.id)}
                    onChange={() => toggle(r.id)}
                    aria-label={`${t("review.selectRow")} ${r.card}`}
                    className="h-4 w-4 accent-[var(--primary)]"
                  />
                </td>
                <td>
                  <RowId id={r.id} seq={r.seq} />
                </td>
                <td>
                  <div className="font-medium text-ink">{r.employee}</div>
                  <div className="text-xs text-ink-subtle">{r.department}</div>
                  {r.phone && <div className="text-xs text-ink-subtle">{r.phone}</div>}
                </td>
                <td>
                  <div className="text-ink">{r.card}</div>
                  <div className="text-xs text-ink-subtle">
                    {r.partner ?? "—"}
                    {r.condition && ` · ${r.condition}`}
                  </div>
                  {rejectingId === r.id && (
                    <div className="mt-2 rounded-lg bg-surface-muted p-2">
                      <Textarea
                        value={rejectText}
                        onChange={(e) => setRejectText(e.target.value)}
                        rows={2}
                        placeholder={t("review.rejectReasonPlaceholder")}
                      />
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          disabled={pending || rejectText.trim().length < 3}
                          onClick={() => runRow(r.id, () => rejectItem(r.id, rejectText))}
                        >
                          {t("review.confirm")}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={pending}
                          onClick={() => {
                            setRejectingId(null);
                            setRejectText("");
                          }}
                        >
                          {t("review.cancel")}
                        </Button>
                      </div>
                    </div>
                  )}
                  {rowErr[r.id] && (
                    <p className="mt-1 text-xs font-medium text-danger" role="alert">
                      {rowErr[r.id]}
                    </p>
                  )}
                </td>
                <td className="text-ink-muted">{r.period}</td>
                <td className="text-ink-muted">
                  {fmtDate(r.submittedAt)}
                  {r.overdue && (
                    <Badge tone="warning" className="ml-2">
                      {t("review.overdueBadge")}
                    </Badge>
                  )}
                </td>
                <td>
                  {rejectingId !== r.id && (
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="success"
                        size="sm"
                        disabled={pending}
                        onClick={() => setApproveId(r.id)}
                      >
                        {t("review.approve")}
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={pending}
                        onClick={() => {
                          setRejectingId(r.id);
                          setRejectText("");
                        }}
                      >
                        {t("review.reject")}
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>

      <ConfirmDialog
        open={!!approveId}
        title={t("review.approveConfirmTitle")}
        message={
          approveRow ? (
            <>
              {approveRow.employee} — {approveRow.card}. {t("review.approveConfirmMessage")}
            </>
          ) : undefined
        }
        confirmLabel={t("review.approve")}
        tone="success"
        busy={pending}
        onConfirm={() => {
          if (approveId) runRow(approveId, () => approveItem(approveId));
          setApproveId(null);
        }}
        onClose={() => setApproveId(null)}
      />

      <ConfirmDialog
        open={confirmBulkApprove}
        title={t("review.bulkApproveTitle")}
        message={`${t("review.bulkApproveMessage")} (${sel.size})? ${t("review.bulkApproveMessageSuffix")}`}
        confirmLabel={t("review.approve")}
        tone="success"
        busy={pending}
        onConfirm={() => {
          runBulk("approve");
          setConfirmBulkApprove(false);
        }}
        onClose={() => setConfirmBulkApprove(false)}
      />
    </div>
  );
}
