"use client";

import { isAddress } from "@solana/kit";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type WalletState, connectPlan, usable } from "@/lib/wallets";
import { WalletDialog } from "./WalletDialog";

/** Errors the WalletProvider reports (its onError) reach the dialog through this tiny event bus. */
const errorListeners = new Set<(name: string) => void>();
export function reportWalletError(e: { name?: string }) {
  for (const l of errorListeners) l(e?.name ?? "WalletError");
}

const WATCH_KEY = "qupon.watchAddress";
const readWatch = () => {
  try {
    const v = localStorage.getItem(WATCH_KEY);
    return v && isAddress(v) ? v : null;
  } catch {
    return null;
  }
};

export type WalletChoice = {
  name: string;
  icon: string;
  readyState: WalletState;
};

type WalletUXValue = {
  /** Installed / loadable wallets in this browser. */
  choices: WalletChoice[];
  /** "Connect wallet": the only wallet directly, else the dialog (picker or how-to-get-one). */
  connect: () => void;
  connectTo: (name: string) => void;
  openDialog: () => void;
  /** Name of the wallet being connected, while the wallet asks the user. */
  pending: string | null;
  /** Read-only "view by address" mode (no wallet in this browser). */
  watch: string | null;
  setWatch: (address: string | null) => void;
};

const Ctx = createContext<WalletUXValue | null>(null);

export function useWalletUX(): WalletUXValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWalletUX must be used inside <WalletUX>");
  return v;
}

/**
 * Wallet connection UX (spec §5.7): detects installed Solana wallets (Wallet Standard), connects the only one in
 * a click, offers a picker when there are several and install / mobile / view-by-address options when there are
 * none. Replaces wallet-adapter's generic modal.
 */
export function WalletUX({ children }: { children: ReactNode }) {
  const {
    wallets,
    wallet,
    select,
    connect: connectSelected,
    connected,
  } = useWallet();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [watch, setWatchState] = useState<string | null>(null);
  const [failure, setFailure] = useState<string>();
  const pendingRef = useRef<string | null>(null);
  pendingRef.current = pending;

  // The wallet refused (popup closed, wallet locked, not ready): stop waiting and explain it in the dialog.
  useEffect(() => {
    const onError = (name: string) => {
      if (!pendingRef.current) return;
      setFailure(name);
      setPending(null);
      setOpen(true);
    };
    errorListeners.add(onError);
    return () => {
      errorListeners.delete(onError);
    };
  }, []);

  // Extensions are invisible to the server: until mounted, render as if none were installed so the first client
  // render matches the server HTML (otherwise "Connect Phantom" vs "Connect wallet" breaks hydration).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    setWatchState(readWatch());
  }, []);

  const choices = useMemo<WalletChoice[]>(
    () =>
      !mounted
        ? []
        : usable(
            wallets.map((w) => ({
              name: w.adapter.name,
              icon: w.adapter.icon,
              readyState: w.readyState as WalletState,
            })),
          ),
    [wallets, mounted],
  );

  const setWatch = useCallback((address: string | null) => {
    setWatchState(address);
    try {
      if (address) localStorage.setItem(WATCH_KEY, address);
      else localStorage.removeItem(WATCH_KEY);
    } catch {
      // private mode: view-only lasts for this page only
    }
  }, []);

  // A connection ends the attempt: close the dialog and leave view-only mode.
  useEffect(() => {
    if (!connected) return;
    setPending(null);
    setOpen(false);
    setWatch(null);
  }, [connected, setWatch]);

  const connectTo = useCallback(
    (name: string) => {
      setFailure(undefined);
      setPending(name);
      if (wallet?.adapter.name === name) {
        // Same wallet again (e.g. after a rejection): autoConnect will not fire, connect explicitly.
        connectSelected().catch(() => undefined);
      } else {
        select(name as Parameters<typeof select>[0]); // autoConnect connects the newly selected wallet
      }
    },
    [wallet, select, connectSelected],
  );

  const connect = useCallback(() => {
    const plan = connectPlan(choices.length);
    if (plan === "direct" && choices[0]) connectTo(choices[0].name);
    else setOpen(true);
  }, [choices, connectTo]);

  const value = useMemo<WalletUXValue>(
    () => ({
      choices,
      connect,
      connectTo,
      openDialog: () => setOpen(true),
      pending,
      watch,
      setWatch,
    }),
    [choices, connect, connectTo, pending, watch, setWatch],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <WalletDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setPending(null);
            setFailure(undefined);
          }
        }}
        error={failure}
      />
    </Ctx.Provider>
  );
}
