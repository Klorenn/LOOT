import { KuyfiBadge } from "@/components/kuyfi-badge";
import { LandingPage } from "@/components/landing-page";
import { cfg } from "@/lib/cfg";

export default async function Home() {
  const { CONTRACTS } = await cfg();
  return <LandingPage kuyfiBadge={<KuyfiBadge contractId={CONTRACTS.chest} />} />;
}
