"use client";

import { Icon } from "@/components/shell/icons";
import { StableText } from "@/components/i18n/StableLabel";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { boErrorFrom } from "@/lib/boClient";

type Role = "issuer" | "registrar" | "investor_demo" | "investor" | "admin";
const HOME: Record<Role, string> = {
  issuer: "/issuer",
  registrar: "/registrar",
  investor_demo: "/investor",
  investor: "/investor",
  admin: "/admin",
};

/**
 * Full navigation after sign-in: the next page renders on the server with the fresh session cookie. `next` is
 * honoured only inside the chosen role's area — /login?next=/issuer then "Registrar" goes to /registrar, not to a
 * cabinet that would refuse it.
 */
function useEnter(next?: string) {
  return (role: Role) =>
    window.location.assign(
      next && (next.startsWith(HOME[role]) || next.startsWith("/account"))
        ? next
        : HOME[role],
    );
}

/** Email + password: the secondary path on /login (the one-click demo identities need no account). */
export function SignInCard({ next }: { next?: string }) {
  const t = useTranslations("login");
  const enter = useEnter(next);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(undefined);
    const res = await fetch("/api/session/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }).catch(() => null);
    if (res?.ok) {
      const { user } = (await res.json()) as { user: { role: Role } };
      enter(user.role);
      return;
    }
    const code = res ? (await boErrorFrom(res)).code : "upstream";
    setError(
      t(
        `errors.${code === "bad_credentials" || code === "rate_limited" ? code : "generic"}`,
      ),
    );
    setPending(false);
  };

  return (
    <form
      onSubmit={submit}
      className="h-full rounded-card border border-n200 bg-n0 p-5 sm:p-6"
      noValidate
    >
      <h2 className="text-lg font-bold text-n900">
        <StableText>{t("emailTitle")}</StableText>
      </h2>
      <p className="mt-1 text-sm text-n600">
        <StableText>{t("emailLead")}</StableText>
      </p>
      <div className="mt-5 space-y-4">
        <TextField
          label={t("email")}
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          label={t("password")}
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error}
        />
      </div>
      <Button
        type="submit"
        block
        size="lg"
        className="mt-6"
        loading={pending}
        disabled={!email || !password}
      >
        {t("submit")}
      </Button>
      <p className="mt-4 text-xs text-n500">
        <StableText>{t("accountsNote")}</StableText>
      </p>
      <p className="mt-4 border-t border-n100 pt-4 text-sm text-n600">
        <StableText>{t("newInvestor")}</StableText>{" "}
        <Link
          href="/signup"
          className="font-semibold text-g700 underline-offset-2 hover:underline"
        >
          <StableText>{t("createAccount")}</StableText>
        </Link>
      </p>
    </form>
  );
}

const DEMO = [
  { role: "issuer", home: "issuer", icon: "building" },
  { role: "registrar", home: "registrar", icon: "users" },
  { role: "investor", home: "investor_demo", icon: "wallet" },
] as const;

/** The primary path on /login: one click per role, no password, no wallet (design language v2, task 91530). */
export function DemoPanel({ next }: { next?: string }) {
  const t = useTranslations("login.demo");
  const enter = useEnter(next);
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState<string>();

  const start = async (role: (typeof DEMO)[number]) => {
    if (pending) return;
    setPending(role.role);
    setError(undefined);
    const res = await fetch("/api/session/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: role.role }),
    }).catch(() => null);
    if (res?.ok) {
      enter(role.home);
      return;
    }
    const code = res ? (await boErrorFrom(res)).code : "upstream";
    setError(t(code === "demo_disabled" ? "disabled" : "failed"));
    setPending(undefined);
  };

  return (
    <section className="h-full rounded-card border border-g200 bg-n0 p-5 sm:p-6">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-demo-bg px-2.5 py-1 text-micro font-bold text-demo-fg">
        <span aria-hidden className="size-1.5 rounded-full bg-current" />
        <StableText>{t("badge")}</StableText>
      </span>
      <h2 className="mt-3 text-lg font-bold text-n900">
        <StableText>{t("title")}</StableText>
      </h2>
      <p className="mt-1 text-sm text-n600">
        <StableText>{t("lead")}</StableText>
      </p>
      {/* A plain form posts to the server before hydration (slow phones); once hydrated the click handler takes over. */}
      <form
        method="post"
        action="/api/session/demo"
        className="mt-5 grid gap-3"
      >
        {next && <input type="hidden" name="next" value={next} />}
        {DEMO.map((d) => (
          <button
            key={d.role}
            type="submit"
            name="role"
            value={d.role}
            onClick={(e) => {
              e.preventDefault();
              void start(d);
            }}
            disabled={!!pending}
            aria-busy={pending === d.role || undefined}
            className="group flex min-h-16 items-center gap-3 rounded-btn border border-n200 bg-n0 p-4 text-left transition hover:border-g300 hover:bg-g50 disabled:opacity-70 sm:gap-4"
          >
            <span
              aria-hidden
              className="grid size-10 shrink-0 place-items-center rounded-sm bg-n50 text-n600 transition-colors group-hover:bg-g100 group-hover:text-g700"
            >
              {pending === d.role ? (
                <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <Icon name={d.icon} className="size-5" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-bold text-n900">
                <StableText>{t(`${d.role}.title`)}</StableText>
              </span>
              <span className="mt-0.5 block text-sm text-n600">
                <StableText>{t(`${d.role}.text`)}</StableText>
              </span>
            </span>
            <Icon
              name="chevronRight"
              className="size-5 shrink-0 text-n400 transition group-hover:translate-x-0.5 group-hover:text-g600"
            />
          </button>
        ))}
      </form>
      {error && (
        <p role="alert" className="mt-4 text-sm font-semibold text-err-fg">
          {error}
        </p>
      )}
      <p className="mt-4 text-xs text-n500">
        <StableText>{t("note")}</StableText>
      </p>
    </section>
  );
}
