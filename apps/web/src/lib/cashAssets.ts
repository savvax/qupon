/** GET /assets: the enabled cash assets of this network (platform v2 §5.1). */
export type PublicAsset = {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  kind: "test" | "stablecoin" | "wrapped_cbdc" | "spl";
  tokenProgram: string;
  freezeAuthority?: string | null;
  mintAuthority?: string | null;
};

/** What the issuer wizard offers: a registry asset (by mint) or a legacy alias when the registry is unreachable. */
export type CashOption = {
  key: string;
  symbol: string;
  name: string;
  decimals: number;
  kind: PublicAsset["kind"];
  mint?: string;
  alias?: "tkzt" | "usdc";
};

/** The request field for POST /issuer/series. */
export const cashField = (o: CashOption) =>
  o.mint ? { cashMint: o.mint } : { cash: o.alias };

/** Input suffix: the tenge sign for tenge assets, else the symbol. */
export const cashSuffix = (o: CashOption) =>
  /KZT/i.test(o.symbol) ? "₸" : o.symbol;
