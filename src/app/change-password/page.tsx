"use client";

import { useActionState } from "react";
import { changePasswordAction, type ChangeState } from "./actions";

const initial: ChangeState = {};

export default function ChangePasswordPage() {
  const [state, formAction, pending] = useActionState(changePasswordAction, initial);
  return (
    <main className="min-h-dvh grid place-items-center bg-neutral-50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm border border-neutral-200">
        <h1 className="text-lg font-semibold text-neutral-900">Смена пароля</h1>
        <p className="mt-1 text-sm text-neutral-500">
          При первом входе необходимо задать постоянный пароль.
        </p>
        <form action={formAction} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700">Новый пароль</label>
            <input
              name="password"
              type="password"
              minLength={8}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-red-500"
              required
            />
            <p className="mt-1 text-xs text-neutral-400">Минимум 8 символов, буквы и цифры.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700">Повторите пароль</label>
            <input
              name="confirm"
              type="password"
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-red-500"
              required
            />
          </div>
          {state.error && <p className="text-sm text-red-600" role="alert">{state.error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
          >
            {pending ? "Сохранение…" : "Сохранить"}
          </button>
        </form>
      </div>
    </main>
  );
}
