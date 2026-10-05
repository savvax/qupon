"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { boErrorFrom } from "@/lib/boClient";

type Role = "issuer" | "registrar" | "investor_demo" | "admin";
const HOME: Record<Role, string> = {
  issuer: "/issuer",
  registrar: "/registrar",
  investor_demo: "/investor",
  admin: "/registrar",
};

function useEnter(next?: string) {
  const router = useRouter();
  return (role: Role) => {
    router.push(next ?? HOME[role]);
    router.refresh();
  };
}

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
      className="rounded-hero border border-n200 bg-n0 p-6 sm:p-8"
      noValidate
    >
      <h1 className="text-2xl font-extrabold tracking-tight">{t("title")}</h1>
      <p className="mt-1.5 text-sm text-n600">{t("lead")}</p>
      <div className="mt-6 space-y-4">
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
      <p className="mt-4 text-xs text-n500">{t("accountsNote")}</p>
    </form>
  );
}

const DEMO = [
  { role: "issuer", home: "issuer" },
  { role: "registrar", home: "registrar" },
  { role: "investor", home: "investor_demo" },
] as const;

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
    <div className="relative overflow-hidden rounded-hero bg-p900 p-6 text-white sm:p-8">
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(90%_80%_at_100%_0%,var(--color-p500)_0%,transparent_60%)] opacity-60"
      />
      <div className="relative">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold ring-1 ring-white/15">
          <span className="size-1.5 rounded-full bg-g400" />
          {t("badge")}
        </span>
        <h2 className="mt-4 text-2xl font-extrabold tracking-tight">
          {t("title")}
        </h2>
        <p className="mt-1.5 text-sm text-p100">{t("lead")}</p>
        <div className="mt-6 grid gap-3">
          {DEMO.map((d) => (
            <button
              key={d.role}
              type="button"
              onClick={() => start(d)}
              disabled={!!pending}
              aria-busy={pending === d.role || undefined}
              className="group flex items-center gap-4 rounded-card bg-n0 p-4 text-left text-n900 transition hover:bg-g50 disabled:opacity-70"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{t(`${d.role}.title`)}</span>
                <span className="mt-0.5 block text-sm text-n600">
                  {t(`${d.role}.text`)}
                </span>
              </span>
              <span
                aria-hidden
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-g600 text-white transition group-hover:translate-x-0.5"
              >
                {pending === d.role ? (
                  <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  "→"
                )}
              </span>
            </button>
          ))}
        </div>
        {error && (
          <p role="alert" className="mt-4 text-sm font-semibold text-[#ffb4b4]">
            {error}
          </p>
        )}
        <p className="mt-5 text-xs text-p100/80">{t("note")}</p>
      </div>
    </div>
  );
}
