import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { login } from "@/api/auth";
import { ApiError } from "@/api/client";
import { AuthShell } from "@/components/AuthShell";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { useAuth } from "@/contexts/AuthContext";

const GOOGLE_ERROR_COPY: Record<string, string> = {
  google_auth_failed: "Google sign-in didn't complete. Please try again.",
  google_not_configured: "Google sign-in isn't available right now.",
  google_email_unverified:
    "Your Google account email isn't verified. Verify it with Google, or create an account with email and password.",
  google_account_conflict:
    "That Google account can't be linked to this email. Sign in with email and password instead.",
};

export default function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { signIn } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const oauthError = useMemo(() => {
    const code = params.get("error");
    if (!code) return null;
    return GOOGLE_ERROR_COPY[code] ?? "Google sign-in failed. Please try again.";
  }, [params]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { access_token, user } = await login({ identifier, password });
      signIn(access_token, user);
      navigate("/home", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Welcome back. Pick up where your syllabus left off."
      footer={
        <>
          New to Vivifi?{" "}
          <Link to="/register" className="font-medium text-accent hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <GoogleSignInButton />
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="label" htmlFor="identifier">
            Email or username
          </label>
          <input
            id="identifier"
            className="input"
            autoComplete="username"
            autoFocus
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {oauthError ? <p className="text-sm text-danger">{oauthError}</p> : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <button className="btn-primary w-full" disabled={submitting} type="submit">
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </AuthShell>
  );
}
