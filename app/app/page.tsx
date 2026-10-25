import { KuyfiBadge } from "@/components/kuyfi-badge";
import { LandingPage } from "@/components/landing-page";
import { KUYFI_CHEST_SCAN } from "@/lib/config";

export default function Home() {
  return <LandingPage kuyfiBadge={<KuyfiBadge contractId={KUYFI_CHEST_SCAN} />} />;
}
