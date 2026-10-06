"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { BoError } from "@/lib/boClient";

/** Accepts a one-time invite token: name + password → session inside the organisation. */
export function InviteForm({ token }: { token: string }) {
  const t = useTranslations("org.invitePage");
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/session/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name, password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { code?: string };
        const key = body.code ?? "generic";
        setError(t.has(`errors.${key}`) ? t(`errors.${key}`) : t("errors.generic"));
        setBusy(false);
        return;
      }
      router.replace("/issuer");
      router.refresh();
    } catch (e) {
      setError(e instanceof BoError ? e.message : t("errors.generic"));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <TextField
        label={t("name")}
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoComplete="name"
        required
      />
      <TextField
        label={t("password")}
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        hint={t("passwordHint")}
        error={error}
        autoComplete="new-password"
        required
      />
      <Button type="submit" disabled={busy || name === "" || password.length < 10}>
        {busy ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
