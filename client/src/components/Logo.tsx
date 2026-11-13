// The OFFICIAL logo file, shown unchanged (only scaled by the browser). Never redraw or recolour it.
export function Logo({ height = 56, className = '' }: { height?: number; className?: string }) {
  return (
    <img src="/assets/trishul-logo-640.png" alt="TRISHUL" style={{ height, aspectRatio: '1312 / 1199' }}
      className={`rounded-xl object-cover bg-crimson ${className}`} />
  );
}
