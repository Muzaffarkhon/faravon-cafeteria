"use client";

import { useActionState, useRef, useEffect } from "react";
import { changeOwnPassword, type ProfilePwState } from "./actions";

const inputCls =
  "mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-red-500";

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState<ProfilePwState, FormData>(changeOwnPassword, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form ref={formRef} action={formAction} className="max-w-sm space-y-4">
      <div>
        <label className="block text-sm font-medium text-neutral-700">Текущий пароль</label>
        <input name="current" type="password" autoComplete="current-password" className={inputCls} required />
      </div>
      <div>
        <label className="block text-sm font-medium text-neutral-700">Новый пароль</label>
        <input name="password" type="password" autoComplete="new-password" minLength={8} className={inputCls} required />
        <p className="mt-1 text-xs text-neutral-400">Минимум 8 символов, буквы и цифры.</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-neutral-700">Повторите новый пароль</label>
        <input name="confirm" type="password" autoComplete="new-password" className={inputCls} required />
      </div>

      {state.error && <p className="text-sm text-red-600" role="alert">{state.error}</p>}
      {state.ok && <p className="text-sm text-emerald-600">Пароль изменён.</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
      >
        {pending ? "Сохранение…" : "Сменить пароль"}
      </button>
    </form>
  );
}
