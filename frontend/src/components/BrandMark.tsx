export function BrandMark() {
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden
        className="inline-block h-3 w-3 rounded-full bg-accent"
        style={{ boxShadow: "0 0 0 3px rgba(217, 119, 87, 0.15)" }}
      />
      <span className="text-lg font-semibold tracking-tight">Vivifi</span>
    </div>
  );
}
