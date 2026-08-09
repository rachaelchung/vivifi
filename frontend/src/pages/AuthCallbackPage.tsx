import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { fetchMe } from "@/api/auth";
import { ApiError, setToken } from "@/api/client";
import { AuthShell } from "@/components/AuthShell";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Landing page after Google OAuth. The API redirects here with
 * `?token=<jwt>`; we store it, hydrate `/auth/me`, and route into the app.
 */
export default function AuthCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setError("Missing sign-in token. Please try again.");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setToken(token);
        const me = await fetchMe();
        if (cancelled) return;
        signIn(token, me);
        // New Google users have no semesters yet — hub redirects to setup.
        navigate("/", { replace: true });
      } catch (err) {
        if (cancelled) return;
        setToken(null);
        setError(
          err instanceof ApiError
            ? err.detail
            : "Couldn't finish Google sign-in. Please try again.",
        );
      }
    })();

    return () => {
      cancelled = true;
    };
    // Intentionally once on mount for the token in the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <AuthShell title="Sign-in failed" subtitle={error}>
        <Link to="/login" className="btn-primary inline-flex w-full">
          Back to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Signing you in…" subtitle="Almost there.">
      <p className="text-sm text-muted">Finishing Google sign-in…</p>
    </AuthShell>
  );
}
