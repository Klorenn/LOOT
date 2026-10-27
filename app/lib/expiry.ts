const MIN_EXPIRY_S = 5 * 60;
const MAX_EXPIRY_S = 90 * 24 * 3600;
/** Mainnet: the relayer only sponsors deadlines up to 30 days. */
const MAX_EXPIRY_MAINNET_S = 30 * 24 * 3600;

/** Expiry is required and in the future: with deadline 0 a chest could never be closed (prize locked). */
export function expiryError(expires: string, mainnet: boolean): string | null {
  const t = new Date(expires).getTime();
  const now = Date.now() / 1000;
  const sec = Math.floor(t / 1000);
  if (!expires || !Number.isFinite(t))
    return "Pick an expiry date — unclaimed prize can only be recovered after it.";
  if (sec < now + MIN_EXPIRY_S) return "Expiry must be at least 5 minutes from now.";
  if (mainnet && sec > now + MAX_EXPIRY_MAINNET_S) return "On mainnet the expiry can be at most 30 days from now.";
  if (sec > now + MAX_EXPIRY_S) return "Expiry can be at most 90 days from now.";
  return null;
}

/** Default `datetime-local` value: 7 days from now, in LOCAL time (toISOString would shift it to UTC). */
export function defaultExpiry(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
