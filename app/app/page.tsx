import { KuyfiBadge } from "@/components/kuyfi-badge";
import { LandingPage } from "@/components/landing-page";
import { CONTRACTS } from "@/lib/config";

export default function Home() {
  return <LandingPage kuyfiBadge={<KuyfiBadge contractId={CONTRACTS.chest} />} />;
}
