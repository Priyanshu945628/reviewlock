"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/ui/logo";
import { TimelineHeroGraphic } from "@/components/shell/timeline-hero-graphic";
import { api } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email || !email.includes("@")) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }
    if (!password) {
      setErrorMessage("Please enter your password.");
      return;
    }

    setLoading(true);
    try {
      const res = await api.auth.login(email, password);
      if (res.ok) {
        router.push("/projects");
      } else {
        setErrorMessage(
          res.error?.message || "Invalid credentials. Please try again."
        );
      }
    } catch {
      setErrorMessage("Failed to connect to authentication server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-bg text-text">
      {/* Left Column: 480px Form on --surface-1 */}
      <div className="w-full lg:w-[480px] shrink-0 min-h-screen bg-surface-1 border-r border-border p-8 md:p-12 flex flex-col justify-between">
        {/* Top: Logo */}
        <div>
          <Logo asLink href="/" />
        </div>

        {/* Center: Auth Form */}
        <div className="my-auto py-8 max-w-sm w-full mx-auto">
          <div className="space-y-1 mb-8">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-text">
              Log in to ReviewLock
            </h1>
            <p className="text-sm text-text-muted">
              Get paid before the client gets the file.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email"
              type="email"
              placeholder="you@domain.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              autoComplete="email"
              autoFocus
            />

            <div className="flex flex-col gap-1.5 w-full">
              <label className="text-xs font-medium text-text-muted select-none">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  autoComplete="current-password"
                  className="h-10 px-3 pr-10 w-full rounded-md bg-surface-2 border border-border text-text placeholder:text-text-faint text-sm transition-colors focus-visible:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text focus:outline-none"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Error Message: red text under field, never an alert (DESIGN §6.2) */}
            {errorMessage && (
              <p className="text-xs text-danger leading-relaxed pt-1">
                {errorMessage}
              </p>
            )}

            <Button
              type="submit"
              variant="primary"
              size="md"
              loading={loading}
              className="w-full mt-2"
            >
              Log in
            </Button>
          </form>

          <p className="mt-6 text-xs text-center text-text-muted">
            Don&apos;t have an account?{" "}
            <Link
              href="/signup"
              className="text-accent hover:underline font-medium"
            >
              Sign up
            </Link>
          </p>
        </div>

        {/* Footer info */}
        <div className="text-[11px] text-text-faint text-center">
          Encrypted sessions · Zero unauthorized original exposure
        </div>
      </div>

      {/* Right Column: Hero Graphic on --bg */}
      <div className="hidden lg:flex flex-1 items-center justify-center p-12 bg-bg relative overflow-hidden">
        <TimelineHeroGraphic />
      </div>
    </div>
  );
}
