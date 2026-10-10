/** KYC application types (GET /me/kyc, /registrar/kyc — task 803) and the SIMULATED tax defaults. */
export type KycDocument = {
  id: number;
  kind:
    "id_document" | "proof_of_address" | "prospectus" | "decision" | "other";
  filename: string;
  mime: string;
  size: number;
  createdAt: number;
};

export type KycResult = {
  series: string;
  investor?: string;
  attestation?: string;
  signatures: string[];
  error?: string;
};

export type KycApplication = {
  id: number;
  userId: number;
  userEmail: string;
  userName: string;
  wallet: string;
  investorType: "individual" | "legal_entity";
  residency: "resident" | "nonresident";
  taxBps: number;
  fullName: string;
  documentIds: number[];
  seriesMints: string[];
  status: "submitted" | "approved" | "rejected";
  reason: string;
  results: KycResult[] | null;
  decidedAt: number | null;
  createdAt: number;
  documents?: KycDocument[];
};

/**
 * Withholding applied to coupons (SIMULATED rule set for the demo): residents 0 % (listed bonds), non-residents
 * 15 %. The registrar can change it on approval in a real deployment.
 */
export const defaultTaxBps = (residency: KycApplication["residency"]) =>
  residency === "nonresident" ? 1500 : 0;

export const formatBytes = (n: number) =>
  n < 1024
    ? `${n} B`
    : n < 1024 * 1024
      ? `${(n / 1024).toFixed(0)} KB`
      : `${(n / 1024 / 1024).toFixed(1)} MB`;

/** 1500 bps → "15.00%" / "15,00 %" (locale-aware, like bpsToPercent; kk shares ru-RU money format). */
export const pct = (bps: number, locale: string) =>
  new Intl.NumberFormat(locale === "en" ? "en" : "ru-RU", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: "always",
  }).format(bps / 10000);
