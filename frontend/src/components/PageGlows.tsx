/**
 * Warme Hintergrund-Glows für Pages — zwei absolut positionierte
 * Radial-Gradients hinter dem Content (oben rechts primary, unten links
 * mit einem Akzent-Hue). Erzeugen die "Liquid"-Atmosphäre, ohne dass
 * jede Page den gleichen Boilerplate-Block schreiben muss.
 */

const ACCENT_VARS: Record<'primary' | 'electricity' | 'water' | 'heating', string> = {
  primary: 'var(--primary)',
  electricity: 'var(--electricity)',
  water: 'var(--water)',
  heating: 'var(--oil)',
};

export function PageGlows({
  accent = 'electricity',
}: {
  /** Sekundärer Glow links unten — primary ist immer oben rechts. */
  accent?: keyof typeof ACCENT_VARS;
}) {
  const accentColor = ACCENT_VARS[accent];
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-48 h-[500px] w-[500px] rounded-full blur-[80px]"
        style={{
          background:
            'radial-gradient(circle, color-mix(in oklch, var(--primary), transparent 70%), transparent 70%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-48 left-32 h-[500px] w-[500px] rounded-full blur-[80px]"
        style={{
          background: `radial-gradient(circle, color-mix(in oklch, ${accentColor}, transparent 80%), transparent 70%)`,
        }}
      />
    </>
  );
}
