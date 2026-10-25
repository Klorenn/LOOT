import Link from "next/link";

const links = [
  { href: "/", label: "Inicio" },
  { href: "/attack", label: "Attack mode" },
];

export function SiteNav() {
  return (
    <nav className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-6 py-4 backdrop-blur-md">
      <Link href="/" className="font-semibold tracking-[-0.03em]">
        ChestZK
      </Link>
      <ul className="flex flex-wrap gap-4 font-mono text-xs tracking-[0.04em] text-muted-foreground">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="hover:text-foreground">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
