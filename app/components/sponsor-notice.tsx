"use client";

import { useEffect, useState } from "react";
import { InlineAlert } from "@/components/inline-alert";
import { useNet } from "@/components/network-provider";

/** Aviso cuando el relayer no patrocina (mainnet: saldo bajo o tope de cuentas passkey alcanzado). */
export function SponsorNotice() {
  const { IS_MAINNET } = useNet();
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!IS_MAINNET) return;
    let off = false;
    fetch("/api/relayer/status")
      .then((r) => r.json())
      .then((s: { sponsoring?: boolean; notice?: string; registrationsLeft?: number }) => {
        if (!off && (s.sponsoring === false || s.registrationsLeft === 0) && s.notice) setNotice(s.notice);
      })
      .catch(() => undefined);
    return () => {
      off = true;
    };
  }, []);
  if (!notice) return null;
  return <InlineAlert tone="gold" title="Sponsorship paused" body={notice} />;
}
