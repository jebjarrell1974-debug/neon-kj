import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 text-center">
      <h1 className="text-8xl font-display font-black text-primary text-glow-primary mb-4">404</h1>
      <h2 className="text-2xl font-bold mb-6 text-foreground">Track Not Found</h2>
      <p className="text-muted-foreground mb-8 max-w-md">
        Looks like this page isn't in our song library. Let's get you back to the main stage.
      </p>
      <Link href="/" className="inline-block">
        <Button size="lg" className="rounded-full shadow-glow-primary">
          Back to Stage
        </Button>
      </Link>
    </div>
  );
}
