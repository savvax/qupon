"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { boPost, boSend } from "@/lib/boClient";
import { type Locale } from "@/i18n/locale";
import { useRunWrite } from "@/lib/useRunWrite";

/** Name and interface language; the language also switches this browser (NEXT_LOCALE). */
export function ProfileForm({
  name: initialName,
  locale: initialLocale,
}: {
  name: string;
  locale: Locale;
}) {
  const t = useTranslations("account.profile");
  const runWrite = useRunWrite();
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [locale, setLocale] = useState(initialLocale);
  const [busy, setBusy] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const ok = await runWrite({
      pending: t("saving"),
      success: () => t("saved"),
      call: () => boSend("PATCH", "me/profile", { name, locale }),
    });
    if (ok) {
      await fetch("/api/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
      }).catch(() => null);
      router.refresh();
    }
    setBusy(false);
  };

  return (
    <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
      <TextField
        label={t("name")}
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={80}
        required
      />
      <Select
        label={t("language")}
        value={locale}
        onValueChange={(v) => setLocale(v as Locale)}
        options={[
          { value: "en", label: "English" },
          { value: "ru", label: "Русский" },
          { value: "kk", label: "Қазақша" },
        ]}
      />
      <div className="sm:col-span-2">
        <Button type="submit" loading={busy} disabled={!name.trim()}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}

/** Change the password; other browsers signed in to this account are signed out. */
export function PasswordForm() {
  const t = useTranslations("account.password");
  const runWrite = useRunWrite();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const weak = next.length > 0 && next.length < 10;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || weak) return;
    setBusy(true);
    setError(undefined);
    const ok = await runWrite({
      pending: t("saving"),
      success: () => t("saved"),
      call: () => boPost("me/password", { current, new: next }),
      onError: (e) =>
        setError(
          e.code === "bad_credentials"
            ? t("wrongCurrent")
            : e.code === "weak_password"
              ? t("weak")
              : undefined,
        ),
    });
    if (ok) {
      setCurrent("");
      setNext("");
    }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <TextField
        label={t("current")}
        type="password"
        autoComplete="current-password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        error={error === t("wrongCurrent") ? error : undefined}
        required
      />
      <TextField
        label={t("new")}
        type="password"
        autoComplete="new-password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        hint={t("hint")}
        error={weak || error === t("weak") ? t("weak") : undefined}
        required
      />
      <div className="sm:col-span-2">
        <Button
          type="submit"
          loading={busy}
          disabled={!current || next.length < 10}
        >
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
