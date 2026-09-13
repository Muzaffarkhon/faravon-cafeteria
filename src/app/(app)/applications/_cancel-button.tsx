"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { translate } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/i18n/shared";
import { cancelItem } from "../actions";

export function CancelItemButton({ itemId, locale }: { itemId: string; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function run() {
    setErr(null);
    start(async () => {
      try {
        const r = await cancelItem(itemId);
        if (r?.error) {
          setErr(r.error);
          setConfirming(false);
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : t("applications.cancelError"));
        setConfirming(false);
      }
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      {confirming ? (
        <span className="inline-flex items-center gap-1.5">
          <Button variant="danger" size="sm" loading={pending} onClick={run}>
            {t("applications.cancelConfirm")}
          </Button>
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => setConfirming(false)}>
            {t("applications.cancelNo")}
          </Button>
        </span>
      ) : (
        <Button variant="secondary" size="sm" onClick={() => setConfirming(true)}>
          {t("applications.cancel")}
        </Button>
      )}
      {err && (
        <span className="text-xs font-medium text-danger" role="alert">
          {err}
        </span>
      )}
    </span>
  );
}
