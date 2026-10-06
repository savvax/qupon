"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { Select, type SelectOption } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { boPost, boSend } from "@/lib/boClient";
import { useRunWrite } from "@/lib/useRunWrite";

export type Member = {
  id: number;
  email: string;
  name: string;
  role: string;
  isDemo: boolean;
};

/**
 * Members of the organisation with one-time invite links. Email delivery is not integrated
 * (SIMULATED): the link is shown once with a copy button.
 */
export function TeamPanel({
  members,
  demo,
  meId,
}: {
  members: Member[];
  demo: boolean;
  meId: number;
}) {
  const t = useTranslations("org.team");
  const runWrite = useRunWrite();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const invite = async () => {
    if (busy || !email.includes("@")) return;
    setBusy(true);
    const r = await runWrite({
      pending: t("creating"),
      success: () => t("inviteTitle"),
      call: () => boPost<{ url: string; expiresAt: string }>("org/invites", { email, role: "issuer" }),
    });
    setBusy(false);
    if (r) {
      setLink(r);
      setEmail("");
    }
  };

  const remove = async (m: Member) => {
    await runWrite({
      pending: t("removing"),
      success: () => t("removed"),
      call: () =>
        boSend("DELETE", `org/members/${m.id}`).then(() => ({ ok: true })),
    });
    router.refresh();
  };

  const roleOptions: SelectOption[] = [
    { value: "issuer", label: t("roleIssuer") },
  ];

  const cols: Column<Member>[] = [
    {
      key: "name",
      header: t("name"),
      render: (m) => (
        <span>
          <span className="font-semibold text-n900">{m.name}</span>
          {m.id === meId && (
            <span className="ml-2 text-xs font-semibold text-g600">{t("you")}</span>
          )}
          <span className="mt-0.5 block text-xs text-n500">{m.email}</span>
        </span>
      ),
    },
    { key: "email", header: t("email"), render: (m) => m.email, hideBelow: "md" },
    {
      key: "role",
      header: t("role"),
      render: (m) => t("roleIssuer"),
      hideBelow: "sm",
    },
    {
      key: "do",
      header: "",
      align: "right",
      render: (m) =>
        demo || m.id === meId ? null : (
          <Button variant="secondary" size="sm" onClick={() => void remove(m)}>
            {t("remove")}
          </Button>
        ),
    },
  ];

  return (
    <div>
      <DataTable columns={cols} rows={members} rowKey={(m) => String(m.id)} empty={t("empty")} />
      {demo ? (
        <p className="mt-4 text-sm text-n600">
          <StableTextLike>{t("demo")}</StableTextLike>
        </p>
      ) : (
        <div className="mt-4 flex justify-end">
          <Button onClick={() => setOpen(true)}>{t("invite")}</Button>
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setLink(null); }} title={t("inviteTitle")}>
        {link ? (
          <div className="space-y-3">
            <p className="text-sm font-semibold">{t("linkTitle")}</p>
            <code className="block overflow-x-auto rounded-btn bg-n100 p-3 text-xs">
              {link.url}
            </code>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-n600">
                {t("expires", { date: new Date(link.expiresAt).toLocaleString() })}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void navigator.clipboard?.writeText(link.url);
                  setCopied(true);
                }}
              >
                {copied ? t("copied") : t("copy")}
              </Button>
            </div>
            <p className="text-xs text-n500">{t("inviteLead")}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-n600">{t("inviteLead")}</p>
            <TextField
              label={t("inviteEmail")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              inputMode="email"
              autoComplete="off"
            />
            <Select label={t("role")} options={roleOptions} value="issuer" disabled />
            <div className="flex justify-end">
              <Button onClick={() => void invite()} disabled={busy || !email.includes("@")}>
                {busy ? t("creating") : t("create")}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

/** The dialog lives in a client component; the demo note keeps the text stable across locales. */
function StableTextLike({ children }: { children: string }) {
  return <span>{children}</span>;
}
