import type { CabinetNavItem } from "@/components/shell/CabinetShell";
import { Icon } from "@/components/shell/icons";

type T = (key: string) => string;

export const issuerNav = (t: T): CabinetNavItem[] => [
  { href: "/issuer", label: t("dashboard"), icon: <Icon name="dashboard" /> },
  { href: "/issuer/series", label: t("series"), icon: <Icon name="series" /> },
  {
    href: "/issuer/series/new",
    label: t("newSeries"),
    icon: <Icon name="plus" />,
  },
  {
    href: "/issuer/organization",
    label: t("organization"),
    icon: <Icon name="building" />,
  },
  { href: "/issuer/team", label: t("team"), icon: <Icon name="users" /> },
  {
    href: "/issuer/documents",
    label: t("documents"),
    icon: <Icon name="statements" />,
  },
];

export const registrarNav = (t: T): CabinetNavItem[] => [
  {
    href: "/registrar",
    label: t("dashboard"),
    icon: <Icon name="dashboard" />,
  },
  {
    href: "/registrar/actions",
    label: t("actions"),
    icon: <Icon name="actions" />,
  },
  {
    href: "/registrar/investors",
    label: t("investors"),
    icon: <Icon name="users" />,
  },
  {
    href: "/registrar/kyc",
    label: t("kyc"),
    icon: <Icon name="shield" />,
  },
  {
    href: "/registrar/reports",
    label: t("reports"),
    icon: <Icon name="statements" />,
  },
  {
    href: "/registrar/activity",
    label: t("activity"),
    icon: <Icon name="activity" />,
  },
  {
    href: "/registrar/autopilot",
    label: t("autopilot"),
    icon: <Icon name="autopilot" />,
  },
];

export const adminNav = (t: T): CabinetNavItem[] => [
  { href: "/admin", label: t("overview"), icon: <Icon name="dashboard" /> },
  { href: "/admin/users", label: t("users"), icon: <Icon name="users" /> },
  {
    href: "/admin/organizations",
    label: t("organizations"),
    icon: <Icon name="building" />,
  },
  { href: "/admin/assets", label: t("assets"), icon: <Icon name="coins" /> },
  {
    href: "/admin/custodian",
    label: t("custodian"),
    icon: <Icon name="bank" />,
  },
  { href: "/admin/series", label: t("series"), icon: <Icon name="series" /> },
  { href: "/admin/system", label: t("system"), icon: <Icon name="server" /> },
  { href: "/admin/network", label: t("network"), icon: <Icon name="globe" /> },
  { href: "/admin/audit", label: t("audit"), icon: <Icon name="shield" /> },
];

/** The shared account area (/account) shows the nav of the user's own cabinet. */
export const navForRole = (role: string, t: T): CabinetNavItem[] =>
  role === "admin"
    ? adminNav(t)
    : role === "issuer"
      ? issuerNav(t)
      : role === "registrar"
        ? registrarNav(t)
        : investorNav(t);

export const investorNav = (t: T): CabinetNavItem[] => [
  { href: "/investor", label: t("portfolio"), icon: <Icon name="wallet" /> },
  {
    href: "/investor/placement",
    label: t("placement"),
    icon: <Icon name="placement" />,
  },
  {
    href: "/investor/meetings",
    label: t("meetings"),
    icon: <Icon name="vote" />,
  },
  {
    href: "/investor/kyc",
    label: t("verification"),
    icon: <Icon name="shield" />,
  },
  {
    href: "/investor/statements",
    label: t("statements"),
    icon: <Icon name="statements" />,
  },
  {
    href: "/investor/reports",
    label: t("reports"),
    icon: <Icon name="statements" />,
  },
];
