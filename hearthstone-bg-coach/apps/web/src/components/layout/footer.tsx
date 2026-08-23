import { Swords } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-border/60 py-10">
      <div className="container flex flex-col items-center gap-4 text-center text-sm text-muted-foreground md:flex-row md:justify-between md:text-left">
        <div className="flex items-center gap-2 font-semibold text-foreground">
          <Swords className="h-4 w-4 text-primary" />
          TavernIQ
        </div>
        <p className="max-w-xl">
          TavernIQ is an independent, fan-made coaching tool and is not affiliated with, endorsed by, or sponsored
          by Blizzard Entertainment. Hearthstone and Battlegrounds are trademarks of Blizzard Entertainment, Inc.
        </p>
        <p className="shrink-0">&copy; {new Date().getFullYear()} TavernIQ</p>
      </div>
    </footer>
  );
}
