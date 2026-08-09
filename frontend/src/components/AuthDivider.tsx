/** Horizontal rule with a centered "or" for stacking Google + password auth. */
export function AuthDivider() {
  return (
    <div className="relative my-5">
      <div className="absolute inset-0 flex items-center" aria-hidden>
        <div className="w-full border-t border-border" />
      </div>
      <div className="relative flex justify-center text-xs uppercase tracking-wider">
        <span className="bg-surface px-3 text-muted">or</span>
      </div>
    </div>
  );
}
