const logoSrc = `${import.meta.env.BASE_URL}vivifilogo.png`;

export function BrandMark() {
  return (
    <div className="flex items-center gap-2">
      <img src={logoSrc} alt="" className="h-8 w-8" aria-hidden />
      <span className="text-lg font-semibold tracking-tight">Vivifi</span>
    </div>
  );
}
