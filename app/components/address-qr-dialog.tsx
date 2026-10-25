"use client";

import { useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { CopyButton } from "@/components/copy-button";

export function AddressQrDialog({
  address,
  open,
  onClose,
}: {
  address: string;
  open: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-auto w-[min(92vw,420px)] rounded-[14px] border border-[var(--line)] bg-[var(--s1)] p-0 text-[var(--text)] backdrop:bg-black/70"
    >
      <div className="flex flex-col items-center gap-5 p-6">
        <p className="font-mono text-[12px] tracking-[0.08em] text-[var(--dim)] uppercase">
          Tu dirección · Stellar testnet
        </p>
        {/* fondo blanco fijo: el QR necesita contraste en modo oscuro */}
        <div className="rounded-[10px] bg-white p-3">
          <QRCodeSVG value={address} size={220} level="M" />
        </div>
        <p className="font-mono text-[12px] leading-[1.6] break-all text-center select-all">
          {address}
        </p>
        <div className="flex flex-wrap items-start justify-center gap-2">
          <CopyButton value={address} />
          <button
            type="button"
            onClick={onClose}
            className="btn-landing btn-landing-s btn-landing-sm"
          >
            Cerrar
          </button>
        </div>
      </div>
    </dialog>
  );
}
