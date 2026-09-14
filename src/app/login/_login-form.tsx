"use client";

import { Suspense } from "react";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";
import { PasswordInput } from "@/components/password-input";
import { loginAction, type LoginState } from "./actions";

const initial: LoginState = {};

const microLabel = (text: string) => (
  <span className="text-xs font-bold uppercase tracking-[0.08em] text-ink-muted">
    {text}
  </span>
);

function LoginFormInner({
  loginLabel,
  passwordLabel,
  submitLabel,
}: {
  loginLabel: string;
  passwordLabel: string;
  submitLabel: string;
}) {
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const [state, formAction, pending] = useActionState(loginAction, initial);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      {/* honeypot: скрыт от людей, заполняют боты (§5.1) */}
      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute left-[-9999px] h-0 w-0 opacity-0"
      />
      <Field label={microLabel(loginLabel)} htmlFor="login">
        <Input
          id="login"
          name="login"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
        />
      </Field>
      <Field label={microLabel(passwordLabel)} htmlFor="password" error={state.error}>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          required
        />
      </Field>

      <Button type="submit" loading={pending} fullWidth size="lg">
        {submitLabel}
      </Button>
    </form>
  );
}

export function LoginForm(props: { loginLabel: string; passwordLabel: string; submitLabel: string }) {
  return (
    <Suspense fallback={<div className="h-[13.5rem]" />}>
      <LoginFormInner {...props} />
    </Suspense>
  );
}
