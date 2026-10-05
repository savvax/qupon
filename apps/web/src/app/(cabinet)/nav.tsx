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
    href: "/investor/statements",
    label: t("statements"),
    icon: <Icon name="statements" />,
  },
];
