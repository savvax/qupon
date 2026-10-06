"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { boErrorFrom } from "@/lib/boClient";

/** Set a new password with a one-time admin-issued token (mock-friendly POST /api/session/reset). */
export function ResetForm({ token }: { token: string }) {
  const t = useTranslations("admin.reset");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending || done) return;
    if (password.length < 10) {
      setError(t("tooShort"));
      return;
    }
    if (password !== confirm) {
      setError(t("mismatch"));
      return;
    }
    setPending(true);
    setError(undefined);
    const res = await fetch("/api/session/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    }).catch(() => null);
    setPending(false);
    if (res?.ok) {
      setDone(true);
      return;
    }
    const code = res ? (await boErrorFrom(res)).code : "upstream";
    setError(
      t(
        code === "invalid_token" || code === "invalid_params"
          ? "invalidToken"
          : "generic",
      ),
    );
  };

  if (done) {
    return (
      <div className="mt-6">
        <p className="rounded-card border border-g300 bg-g50 px-4 py-3 text-sm text-g800">
          {t("done")}
        </p>
        <Button asChild className="mt-4" block size="lg">
          <Link href="/login">{t("signIn")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
      <TextField
        label={t("password")}
        type="password"
        autoComplete="new-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        hint={t("hint")}
      />
      <TextField
        label={t("confirm")}
        type="password"
        autoComplete="new-password"
        required
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={error}
      />
      <Button
        type="submit"
        block
        size="lg"
        loading={pending}
        disabled={!password || !confirm}
      >
        {t("submit")}
      </Button>
    </form>
  );
}
