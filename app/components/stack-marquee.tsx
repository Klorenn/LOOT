import { cn } from "cn";
import {
  IconCircom,
  IconFreighter,
  IconOpenzeppelin,
  IconSmartAccountKit,
  IconSoroban,
  IconStellar,
} from "@/components/stack-logos";

type Item = {
  name: string;
  logoOnly?: boolean;
  textOnly?: boolean;
  icon?: React.ReactNode;
};

const ITEMS: Item[] = [
  {
    name: "Stellar",
    icon: <IconStellar style={{ height: 26, width: "auto" }} />,
  },
  {
    name: "Soroban",
    icon: <IconSoroban style={{ height: 22, width: "auto" }} />,
  },
  {
    name: "Circom",
    logoOnly: true,
    icon: <IconCircom style={{ height: 20, width: "auto" }} />,
  },
  { name: "snarkjs", textOnly: true },
  {
    name: "OpenZeppelin",
    icon: <IconOpenzeppelin style={{ height: 22, width: "auto" }} />,
  },
  {
    name: "Freighter",
    logoOnly: true,
    icon: <IconFreighter style={{ height: 20, width: "auto" }} />,
  },
  {
    name: "Passkeys",
    icon: <IconSmartAccountKit style={{ height: 22, width: "auto" }} />,
  },
];

function Track({ hidden }: { hidden?: boolean }) {
  return (
    <ul className="stack-track" aria-hidden={hidden || undefined}>
      {ITEMS.map((item) => (
        <li
          key={item.name}
          className="stack-item"
          aria-label={item.logoOnly ? item.name : undefined}
        >
          {!item.textOnly && item.icon}
          {!item.logoOnly && <span>{item.name}</span>}
        </li>
      ))}
    </ul>
  );
}

/** BUILT ON logo marquee — CSS loop, pause on hover, edge fade. */
export function StackMarquee({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center border-b border-[var(--line)] py-[30px]",
        className,
      )}
    >
      <div className="mx-auto flex w-full max-w-[1200px] items-center gap-10 px-6">
        <span
          data-fade
          className="shrink-0 font-mono text-[12px] tracking-[0.1em] text-[var(--dim)]"
        >
          BUILT ON
        </span>
        <div className="stack-mq min-w-0 flex-1">
          <Track />
          <Track hidden />
        </div>
      </div>
    </div>
  );
}
