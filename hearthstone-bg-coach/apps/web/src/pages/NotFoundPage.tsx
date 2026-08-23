import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  return (
    <div className="container flex flex-col items-center justify-center gap-4 py-32 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-primary">404</p>
      <h1 className="text-3xl font-bold">This page wandered off into the Tavern</h1>
      <p className="max-w-md text-muted-foreground">
        The page you're looking for doesn't exist. Let's get you back to solid ground.
      </p>
      <Button asChild>
        <Link to="/">Back home</Link>
      </Button>
    </div>
  );
}
