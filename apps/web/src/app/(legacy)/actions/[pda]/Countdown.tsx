"use client";

import { useEffect, useState } from "react";

/** Ticking countdown to a voting deadline (Asia/Almaty wall clock beside it). */
export function Countdown({ endsAt }: { endsAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const ms = new Date(endsAt).getTime() - now;
  if (ms <= 0) {
    return (
      <span className="font-mono text-xs text-red-300">voting closed</span>
    );
  }
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const label =
    d > 0
      ? `${d}d ${h}h ${m}m`
      : h > 0
        ? `${h}h ${m}m ${sec}s`
        : `${m}m ${sec}s`;
  return <span className="font-mono text-xs text-amber-300">{label} left</span>;
}
