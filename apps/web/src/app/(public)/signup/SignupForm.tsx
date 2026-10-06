"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { StableText } from "@/components/i18n/StableLabel";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { boErrorFrom } from "@/lib/boClient";

const KNOWN = [
  "email_taken",
  "weak_password",
  "invalid_params",
  "rate_limited",
];

/** Investor sign-up: name, email, password → an active investor account, signed in, on to onboarding. */
export function SignupForm() {
  const t = useTranslations("account.signup");
  const locale = useLocale();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<{
    field: "email" | "password" | "form";
    text: string;
  }>();
  const [pending, setPending] = useState(false);
  const short = password.length > 0 && password.length < 10;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending || short) return;
    setPending(true);
    setError(undefined);
    const res = await fetch("/api/session/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, locale }),
    }).catch(() => null);
    if (res?.ok) {
      // full navigation: /investor renders on the server with the new session
      window.location.assign("/investor");
      return;
    }
    const code = res ? (await boErrorFrom(res)).code : "upstream";
    const text = t(`errors.${KNOWN.includes(code) ? code : "generic"}`);
    setError({
      field:
        code === "email_taken"
          ? "email"
          : code === "weak_password"
            ? "password"
            : "form",
      text,
    });
    setPending(false);
  };

  return (
    <form
      onSubmit={submit}
      className="h-full rounded-hero border border-n200 bg-n0 p-6 sm:p-8"
      noValidate
    >
      <h1 className="text-2xl font-extrabold tracking-tight">
        <StableText>{t("title")}</StableText>
      </h1>
      <p className="mt-1.5 text-sm text-n600">
        <StableText>{t("lead")}</StableText>
      </p>
      <div className="mt-6 space-y-4">
        <TextField
          label={t("name")}
          autoComplete="name"
          required
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <TextField
          label={t("email")}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={error?.field === "email" ? error.text : undefined}
        />
        <TextField
          label={t("password")}
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint={t("passwordHint")}
          error={
            error?.field === "password"
              ? error.text
              : short
                ? t("errors.weak_password")
                : undefined
          }
        />
      </div>
      {error?.field === "form" && (
        <p role="alert" className="mt-4 text-sm font-semibold text-err-fg">
          {error.text}
        </p>
      )}
      <Button
        type="submit"
        block
        size="lg"
        className="mt-6"
        loading={pending}
        disabled={!name.trim() || !email.trim() || !password || short}
      >
        {t("submit")}
      </Button>
      <p className="mt-4 text-sm text-n600">
        {t("haveAccount")}{" "}
        <Link href="/login" className="font-semibold text-g700 hover:underline">
          {t("signIn")}
        </Link>
      </p>
    </form>
  );
}
