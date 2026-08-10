import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { ApiError } from "@/api/client";
import { useCreateSemester, useSemesters } from "@/api/semesters";
import { BrandMark } from "@/components/BrandMark";
import { useAuth } from "@/contexts/AuthContext";

export default function SemesterSetupPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const isFirstRun = params.get("first_run") === "1";
  const { signOut, user } = useAuth();

  const { data: semesters } = useSemesters();
  const createSemester = useCreateSemester();

  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (startDate && endDate && endDate < startDate) {
      setError("End date can't be before start date.");
      return;
    }

    try {
      await createSemester.mutateAsync({
        name: name.trim(),
        start_date: startDate || null,
        end_date: endDate || null,
        is_active: true,
      });
      navigate("/home", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Couldn't create semester.");
    }
  }

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <BrandMark />
        {user ? (
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted">{user.email}</span>
            <button className="btn-ghost" onClick={signOut} type="button">
              Sign out
            </button>
          </div>
        ) : null}
      </header>

      <main className="mx-auto max-w-xl px-6 pb-24 pt-10">
        <div className="card p-8">
          <p className="text-xs font-medium uppercase tracking-wider text-accent">
            {isFirstRun ? "Welcome" : "New semester"}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Let's set up your semester.
          </h1>
          <p className="mt-2 text-sm text-muted">
            Semesters act like folders for your courses. Name it however you actually
            refer to it — <span className="font-medium">Fall 2025</span>,{" "}
            <span className="font-medium">F25</span>, or just{" "}
            <span className="font-medium">Spring</span>. Dates are optional and only
            help Vivifi understand recurring assignments.
          </p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <div>
              <label className="label" htmlFor="name">
                Semester name
              </label>
              <input
                id="name"
                className="input"
                placeholder="Fall 2025"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={120}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label" htmlFor="start_date">
                  Start date <span className="text-muted">(optional)</span>
                </label>
                <input
                  id="start_date"
                  type="date"
                  className="input"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor="end_date">
                  End date <span className="text-muted">(optional)</span>
                </label>
                <input
                  id="end_date"
                  type="date"
                  className="input"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <div className="flex items-center justify-between pt-2">
              {semesters && semesters.length > 0 ? (
                <Link to="/home" className="text-sm text-muted hover:underline">
                  Cancel
                </Link>
              ) : (
                <span />
              )}
              <button
                type="submit"
                className="btn-primary"
                disabled={createSemester.isPending || !name.trim()}
              >
                {createSemester.isPending ? "Creating…" : "Create semester"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
