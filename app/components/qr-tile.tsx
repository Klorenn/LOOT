"use client";

import { QRCodeSVG } from "qrcode.react";

/**
 * QR real (qrcode.react): módulos #0C0B10 sobre un tile #F5F2EC de 18px de margen, radio 14, ECC M.
 * `id` permite serializar el SVG a PNG para descargarlo.
 */
export function QrTile({
  value,
  id,
  size = 220,
  pad = 18,
}: {
  value: string;
  id?: string;
  size?: number;
  pad?: number;
}) {
  return (
    <div
      className="inline-block rounded-[14px] bg-[#F5F2EC]"
      style={{ padding: pad }}
      role="img"
      aria-label={`QR code for ${value}`}
    >
      <QRCodeSVG
        id={id}
        value={value}
        size={size}
        level="M"
        marginSize={0}
        fgColor="#0C0B10"
        bgColor="#F5F2EC"
      />
    </div>
  );
}

/** Serializa un <svg id> a PNG (SVG → canvas → toBlob) y lo descarga. */
export async function downloadQrPng(svgId: string, filename: string, scale = 4) {
  const svg = document.getElementById(svgId) as SVGSVGElement | null;
  if (!svg) return;
  const pad = 18 * scale;
  const side = Number(svg.getAttribute("width") ?? 220) * scale;
  const xml = new XMLSerializer().serializeToString(svg);
  const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("svg load failed"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = side + pad * 2;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#F5F2EC";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, pad, pad, side, side);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } finally {
    URL.revokeObjectURL(url);
  }
}
