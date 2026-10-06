"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { formatDateTime } from "@/lib/format";
import { boPost, boSend } from "@/lib/boClient";
import { useRunWrite } from "@/lib/useRunWrite";

/** One users row as the Go API serialises it (internal/api/auth.go userDTO). */
export type UserDTO = {
  id: number;
  email: string;
  name: string;
  role: string;
  isDemo: boolean;
  orgId: number | null;
  status: string;
  locale: string;
};

type OrgOption = { id: number; name: string };

const ROLES = ["issuer", "registrar", "investor", "admin"] as const;
const STATUSES = ["active", "disabled", "pending"] as const;

function orgOptions(
  t: (k: string) => string,
  orgs: OrgOption[],
): { value: string; label: string }[] {
  return [
    { value: "0", label: t("noOrg") },
    ...orgs.map((o) => ({ value: String(o.id), label: o.name })),
  ];
}

/** "Create user" (§5.2): email, name, role, organisation, initial password. */
export function UserDialog({ orgs }: { orgs: OrgOption[] }) {
  const t = useTranslations("admin.users");
  const runWrite = useRunWrite();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<string>("investor");
  const [org, setOrg] = useState("0");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setEmail("");
    setName("");
    setRole("investor");
    setOrg("0");
    setPassword("");
    setError(undefined);
  };

  const create = async () => {
    if (!email.trim().includes("@") || !name.trim() || password.length < 10) {
      setError(t("create.invalid"));
      return;
    }
    setError(undefined);
    setBusy(true);
    const res = await runWrite<{ user: UserDTO }>({
      pending: t("create.pending"),
      success: () => t("create.success"),
      call: () =>
        boPost<{ user: UserDTO }>("admin/users", {
          email: email.trim(),
          name: name.trim(),
          role,
          orgId: Number(org) || null,
          password,
        }),
    });
    setBusy(false);
    if (res) {
      setOpen(false);
      reset();
      router.refresh();
    }
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>{t("create.title")}</Button>
      <Dialog
        open={open}
        onOpenChange={(o) => !busy && setOpen(o)}
        title={t("create.title")}
        description={t("create.lead")}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              ✕
            </Button>
            <Button loading={busy} onClick={() => void create()}>
              {t("create.submit")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <TextField
            label={t("create.email")}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
          />
          <TextField
            label={t("create.name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Select
            label={t("colRole")}
            value={role}
            onValueChange={setRole}
            options={ROLES.map((r) => ({ value: r, label: t(`roles.${r}`) }))}
          />
          <Select
            label={t("colOrg")}
            value={org}
            onValueChange={setOrg}
            options={orgOptions(t, orgs)}
          />
          <TextField
            label={t("create.password")}
            type="password"
            hint={t("create.passwordHint")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={error}
            autoComplete="new-password"
          />
        </div>
      </Dialog>
    </>
  );
}

/** One-time reset link (§5.2): shown once, copy button, 24 h expiry. */
function ResetLinkModal({
  user,
  onClose,
}: {
  user: UserDTO;
  onClose: () => void;
}) {
  const t = useTranslations("admin.users.resetLink");
  const runWrite = useRunWrite();
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // The API may return a relative URL (mock mode); display/copy absolute.
  const absolute = (url: string) =>
    url.startsWith("http")
      ? url
      : new URL(url, window.location.origin).toString();

  const issue = async () => {
    setBusy(true);
    const res = await runWrite<{ url: string; expiresAt: string }>({
      pending: t("pending"),
      success: () => t("success"),
      call: () =>
        boPost<{ url: string; expiresAt: string }>(
          `admin/users/${user.id}/reset-link`,
        ),
    });
    setBusy(false);
    if (res) setLink(res);
  };

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(absolute(link.url));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("title")}
      description={t("lead", { name: user.name })}
      footer={
        link ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              ✕
            </Button>
            <Button variant="secondary" onClick={() => void copy()}>
              {copied ? t("copied") : t("copy")}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              ✕
            </Button>
            <Button loading={busy} onClick={() => void issue()}>
              {t("issue")}
            </Button>
          </>
        )
      }
    >
      {link ? (
        <div className="flex flex-col gap-3">
          <p className="rounded-card border border-warn-bd bg-warn-bg px-3 py-2 text-xs text-warn-fg">
            {t("once")}
          </p>
          <input
            readOnly
            aria-label={t("urlLabel")}
            value={absolute(link.url)}
            onFocus={(e) => e.target.select()}
            className="h-10 w-full rounded-btn border border-n300 bg-n50 px-3 font-mono text-xs"
          />
          <p className="text-xs text-n500">
            {t("expires", {
              time: formatDateTime(link.expiresAt),
            })}
          </p>
        </div>
      ) : (
        <p className="text-sm text-n600">{t("body")}</p>
      )}
    </Dialog>
  );
}

/** Per-row actions: edit dialog (role/org/status/name) + reset link.
 * Demo users are read-only (the API refuses PATCH and reset links on them). */
export function UserRowActions({
  user,
  orgs,
}: {
  user: UserDTO;
  orgs: OrgOption[];
}) {
  const t = useTranslations("admin.users");
  const runWrite = useRunWrite();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState(user.role);
  const [org, setOrg] = useState(user.orgId ? String(user.orgId) : "0");
  const [status, setStatus] = useState(user.status);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const res = await runWrite<{ user: UserDTO }>({
      pending: t("edit.pending"),
      success: () => t("edit.success"),
      call: () =>
        boSend<{ user: UserDTO }>("PATCH", `admin/users/${user.id}`, {
          name: name.trim(),
          role,
          orgId: Number(org),
          status,
        }),
    });
    setBusy(false);
    if (res) {
      setOpen(false);
      router.refresh();
    }
  };

  if (user.isDemo) return <span className="text-xs text-n400">—</span>;

  return (
    <>
      <span className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setResetOpen(true)}
        >
          {t("resetLink.title")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
          {t("edit.title")}
        </Button>
      </span>
      <Dialog
        open={open}
        onOpenChange={(o) => !busy && setOpen(o)}
        title={t("edit.title")}
        description={user.email}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              ✕
            </Button>
            <Button loading={busy} onClick={() => void save()}>
              {t("edit.submit")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <TextField
            label={t("create.name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Select
            label={t("colRole")}
            value={role}
            onValueChange={setRole}
            options={ROLES.map((r) => ({ value: r, label: t(`roles.${r}`) }))}
          />
          <Select
            label={t("colOrg")}
            value={org}
            onValueChange={setOrg}
            options={orgOptions(t, orgs)}
          />
          <div>
            <Select
              label={t("colStatus")}
              value={status}
              onValueChange={setStatus}
              options={STATUSES.map((s) => ({
                value: s,
                label: t(`statuses.${s}`),
              }))}
            />
            {status === "disabled" && (
              <p className="mt-2">
                <Badge tone="warn">{t("edit.disableNote")}</Badge>
              </p>
            )}
          </div>
        </div>
      </Dialog>
      {resetOpen && (
        <ResetLinkModal user={user} onClose={() => setResetOpen(false)} />
      )}
    </>
  );
}
