import { Link, NavLink } from "react-router-dom";
import { Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function NavBar() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Swords className="h-5 w-5" />
          </span>
          Tavern<span className="text-primary">IQ</span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
          <Link to="/#how-it-works" className="transition-colors hover:text-foreground">
            How it works
          </Link>
          <NavLink
            to="/report/sample"
            className={({ isActive }) => cn("transition-colors hover:text-foreground", isActive && "text-foreground")}
          >
            Sample report
          </NavLink>
          <Link to="/#faq" className="transition-colors hover:text-foreground">
            FAQ
          </Link>
        </nav>

        <Button asChild size="sm">
          <Link to="/upload">Upload VOD</Link>
        </Button>
      </div>
    </header>
  );
}
