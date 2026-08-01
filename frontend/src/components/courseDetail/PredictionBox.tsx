import { useState } from "react";

import { ApiError } from "@/api/client";
import { usePredict } from "@/api/liveViews";
import type {
  PredictResponse,
  ReweightApplied,
  Scenario,
} from "@/api/types";

interface PredictionBoxProps {
  courseSlug: string;
}

/**
 * Prediction "query box, not a chat" (SPEC §Grade Calculator).
 *
 * You type a question, you get a number (or a scenarios table when a single
 * number would be misleading — e.g. two tests still to go, so acing one vs.
 * bombing it leads to very different needs on the other).
 *
 * The most recent result is rendered right below the input; typing a new
 * query replaces it. There is intentionally no history of prior queries.
 */
export function PredictionBox({ courseSlug }: PredictionBoxProps) {
  const predict = usePredict(courseSlug);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<PredictResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setError(null);
    try {
      const r = await predict.mutateAsync(query.trim());
      setResult(r);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Couldn't run prediction.");
      setResult(null);
    }
  }

  return (
    <section className="card p-6">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted">Ask</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight">
            What if…?
          </h2>
        </div>
        <p className="max-w-sm text-right text-xs text-muted">
          e.g. "what do I need on the final to get an A?"<br />
          "what should I aim for on my next test to keep an A?"<br />
          "my final is worth 20%, what do I need for an A?"
        </p>
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          className="input flex-1"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask a grade question…"
          aria-label="Grade query"
        />
        <button
          type="submit"
          className="btn-primary"
          disabled={predict.isPending || !query.trim()}
        >
          {predict.isPending ? "Thinking…" : "Ask"}
        </button>
      </form>
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      {result ? <PredictionAnswer result={result} /> : null}
    </section>
  );
}

function PredictionAnswer({ result }: { result: PredictResponse }) {
  const hasScenarios =
    (result.kind === "scenarios" || result.kind === "reweight_scenarios") &&
    result.scenarios &&
    result.scenarios.length > 0;
  return (
    <div className="mt-5 rounded-xl border border-border bg-bg/40 p-4">
      {result.reweight_applied ? (
        <ReweightNotice info={result.reweight_applied} />
      ) : null}
      {hasScenarios ? (
        <ScenarioTable scenarios={result.scenarios!} />
      ) : (
        <BigAnswer result={result} />
      )}
      <p className="mt-3 text-sm text-muted">{result.explanation}</p>
    </div>
  );
}

function BigAnswer({ result }: { result: PredictResponse }) {
  if (result.kind === "current_grade" && result.current_pct !== null) {
    return (
      <p className="font-num text-4xl font-semibold tracking-tight">
        {round1(result.current_pct)}%
        {result.current_letter ? (
          <span className="ml-3 text-2xl text-muted">
            {result.current_letter}
          </span>
        ) : null}
      </p>
    );
  }
  if (result.answer !== null) {
    return (
      <div className="flex flex-wrap items-baseline gap-3">
        <p
          className={
            "font-num text-4xl font-semibold tracking-tight " +
            (result.reachable === false ? "text-danger" : "text-fg")
          }
        >
          {round1(result.answer)}%
        </p>
        {result.needed_points !== null &&
        result.kind === "needed_on_entry" &&
        result.needed_points > 0 ? (
          <p className="font-num text-lg text-muted">
            (~{Math.round(result.needed_points * 100) / 100} pts)
          </p>
        ) : null}
        {result.reachable === false ? (
          <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium uppercase tracking-wider text-danger">
            not reachable
          </span>
        ) : result.already_locked_in ? (
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium uppercase tracking-wider text-accent">
            locked in
          </span>
        ) : null}
      </div>
    );
  }
  return null;
}

/**
 * Scenarios table (SPEC §Grade Math Semantics: "return a small scenarios
 * table (e.g. 'best case / likely / minimum needed') rather than a single
 * answer" — Vivifi's variant: ace / steady / recover).
 *
 * Each scenario is a small card with:
 *   - a headline (label + resulting grade)
 *   - a per-item breakdown (leg pcts, tagged anchor/solve so you can see
 *     which score is fixed vs. what you need)
 *   - a status pill (locked in / reachable / not reachable)
 */
function ScenarioTable({ scenarios }: { scenarios: Scenario[] }) {
  return (
    <div className="space-y-2">
      {scenarios.map((s) => (
        <ScenarioRow key={s.id} scenario={s} />
      ))}
    </div>
  );
}

function ScenarioRow({ scenario: s }: { scenario: Scenario }) {
  const border = !s.reachable
    ? "border-danger/30 bg-danger/5"
    : s.id === "steady"
      ? "border-accent/30 bg-accent/5"
      : "border-border bg-surface";

  return (
    <div className={"rounded-lg border p-3 " + border}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-semibold tracking-tight">{s.label}</p>
        <div className="flex items-baseline gap-2">
          <p
            className={
              "font-num text-lg font-semibold " +
              (!s.reachable ? "text-danger" : "text-fg")
            }
          >
            {round1(s.resulting_grade_pct)}%
          </p>
          {s.resulting_letter ? (
            <p className="font-num text-sm text-muted">{s.resulting_letter}</p>
          ) : null}
          {!s.reachable ? (
            <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-danger">
              miss
            </span>
          ) : s.already_locked_in ? (
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-accent">
              locked in
            </span>
          ) : null}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {s.legs.map((leg, i) => {
          const showAny =
            s.already_locked_in && leg.role === "solve" && leg.pct <= 0;
          return (
            <span
              key={`${leg.entry_name}-${i}`}
              className="inline-flex items-baseline gap-1.5"
            >
              <span className="font-medium text-fg">{leg.entry_name}</span>
              <span
                className={
                  "font-num " +
                  (leg.role === "anchor"
                    ? "text-muted"
                    : !s.reachable
                      ? "text-danger"
                      : "text-fg")
                }
              >
                {showAny ? "any" : `${round1(Math.max(0, leg.pct))}%`}
              </span>
              <span className="uppercase tracking-wider text-[10px]">
                ({leg.role})
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function ReweightNotice({ info }: { info: ReweightApplied }) {
  return (
    <div className="mb-3 rounded-md border border-accent/30 bg-accent/5 p-3 text-xs">
      <p className="font-medium text-fg">
        Assuming <span className="font-semibold">{info.new_category_name}</span>{" "}
        is worth <span className="font-num">{round1(info.new_weight_pct)}%</span>.
      </p>
      <p className="mt-1 text-muted">
        Existing categories scaled proportionally:{" "}
        {info.scaled.map((s, i) => (
          <span key={s.name}>
            {i > 0 ? ", " : ""}
            {s.name}{" "}
            <span className="font-num">
              {round1(s.original_weight_pct)}% → {round1(s.scaled_weight_pct)}%
            </span>
          </span>
        ))}
        . Nothing saved to your course — this is a one-off "what if".
      </p>
    </div>
  );
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
