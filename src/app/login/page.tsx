"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { loginAction, type LoginState } from "./actions";

const initial: LoginState = {};

export default function LoginPage() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const [state, formAction, pending] = useActionState(loginAction, initial);

  return (
    <main className="min-h-dvh grid place-items-center bg-neutral-50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm border border-neutral-200">
        <h1 className="text-xl font-semibold text-neutral-900">Кафетерий льгот</h1>
        <p className="mt-1 text-sm text-neutral-500">Группа компаний «Фаровон»</p>

        <form action={formAction} className="mt-6 space-y-4">
          <input type="hidden" name="next" value={next} />
          <div>
            <label className="block text-sm font-medium text-neutral-700">Логин</label>
            <input
              name="login"
              autoComplete="username"
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-red-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700">Пароль</label>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-red-500"
              required
            />
          </div>

          {state.error && (
            <p className="text-sm text-red-600" role="alert">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
          >
            {pending ? "Вход…" : "Войти"}
          </button>
        </form>

        <p className="mt-6 text-xs text-neutral-400">
          Логин и одноразовый пароль сотрудник получает в Telegram-боте. Демо-доступ:
          superadmin / content / approver / hrbp / analyst / ivanov — пароль Password1
        </p>
      </div>
    </main>
  );
}
