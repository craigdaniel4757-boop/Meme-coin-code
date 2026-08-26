"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useModelStore } from "@/store/modelStore";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/arena", label: "Arena" },
  { href: "/lab", label: "Lab" },
];

export function NavBar() {
  const pathname = usePathname();
  const hydrate = useModelStore((s) => s.hydrate);
  const model = useModelStore((s) => s.model);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet to-violet-strong text-sm font-bold text-bg font-display">
            T
          </span>
          <span className="font-display text-lg font-semibold tracking-tight text-text">TavernIQ</span>
        </Link>

        <nav className="flex items-center gap-1">
          {LINKS.map((link) => {
            const active = link.href === "/" ? pathname === "/" : pathname?.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  active ? "bg-panel-2 text-text" : "text-text-muted hover:text-text"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-2 rounded-full border border-border bg-panel px-3 py-1.5 text-xs text-text-muted sm:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-good" />
          <span className="tabular">{(model?.gamesPlayed ?? 0).toLocaleString()}</span>
          <span>games learned</span>
        </div>
      </div>
    </header>
  );
}
