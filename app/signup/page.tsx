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

export default function SignupPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!displayName.trim()) {
      setErrorMessage("Please enter your name or studio name.");
      return;
    }
    if (!email || !email.includes("@")) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }
    if (!password || password.length < 8) {
      setErrorMessage("Password must be at least 8 characters long.");
      return;
    }

    setLoading(true);
    try {
      const res = await api.auth.signup(email, password, displayName);
      if (res.ok) {
        router.push("/projects");
      } else {
        setErrorMessage(
          res.error?.message || "Could not complete signup. Please try again."
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
              Create an editor account
            </h1>
            <p className="text-sm text-text-muted">
              Get paid before the client gets the file.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Your Name or Studio"
              placeholder="e.g. Priyanshu"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={loading}
              autoFocus
            />

            <Input
              label="Email"
              type="email"
              placeholder="you@domain.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              autoComplete="email"
            />

            <div className="flex flex-col gap-1.5 w-full">
              <label className="text-xs font-medium text-text-muted select-none">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  autoComplete="new-password"
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

            {/* Error Message: red text under field */}
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
              Start free
            </Button>
          </form>

          <p className="mt-6 text-xs text-center text-text-muted">
            Already have an account?{" "}
            <Link
              href="/login"
              className="text-accent hover:underline font-medium"
            >
              Log in
            </Link>
          </p>
        </div>

        {/* Footer info */}
        <div className="text-[11px] text-text-faint text-center">
          Private encrypted cloud vault · Zero client original access
        </div>
      </div>

      {/* Right Column: Hero Graphic on --bg */}
      <div className="hidden lg:flex flex-1 items-center justify-center p-12 bg-bg relative overflow-hidden">
        <TimelineHeroGraphic />
      </div>
    </div>
  );
}
