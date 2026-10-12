import Link from "next/link";
import { SearchX, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-bg text-text flex flex-col">
      <header className="h-14 border-b border-border flex items-center px-6">
        <Link href="/projects">
          <Logo />
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-[440px] rounded-lg bg-surface-1 border border-border p-8 shadow-2xl text-center space-y-6">
          <div className="w-14 h-14 rounded-full bg-surface-2 text-text-muted flex items-center justify-center mx-auto">
            <SearchX className="w-7 h-7" />
          </div>

          <div className="space-y-1.5">
            <h1 className="font-display text-xl font-semibold text-text">
              Page Not Found
            </h1>
            <p className="text-xs text-text-muted">
              The page you are looking for does not exist or may have been moved.
            </p>
          </div>

          <Link href="/projects" className="block">
            <Button variant="primary" size="lg" className="w-full gap-2">
              <ArrowLeft className="w-4 h-4" />
              Return to dashboard
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
