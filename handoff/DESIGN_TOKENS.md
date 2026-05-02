# Design Tokens — Liquid Glass

Alle Werte sind in OKLCH definiert (außer Schatten-RGBA). Direkt aus dem
Mockup `design-system.jsx` extrahiert — verbindlich, nicht „ungefähr".

## Farben — Light Mode

| Token              | Wert                              | Verwendung                          |
|--------------------|-----------------------------------|-------------------------------------|
| `bg`               | `oklch(0.985 0.006 70)`           | Page Background                     |
| `bgWash`           | `oklch(0.97 0.012 60)`            | Wash hinter Glas                    |
| `surface`          | `rgba(255, 252, 248, 0.72)`       | Glas-Karten Default                 |
| `surfaceSolid`     | `oklch(0.99 0.004 70)`            | Solide Karten ohne Blur             |
| `surfaceHigh`      | `rgba(255, 253, 250, 0.85)`       | Sheets, Modals                      |
| `border`           | `oklch(0.88 0.008 60 / 0.5)`      | Standard Border                     |
| `borderStrong`     | `oklch(0.82 0.01 60 / 0.6)`       | Active States                       |
| `label`            | `oklch(0.18 0.01 60)`             | Primary Text                        |
| `secondary`        | `oklch(0.42 0.012 60)`            | Body Text                           |
| `tertiary`         | `oklch(0.62 0.012 60)`            | Captions, Labels                    |
| `quaternary`       | `oklch(0.78 0.01 60)`             | Disabled, Placeholder               |
| `fill`             | `oklch(0.92 0.012 60 / 0.5)`      | Subtle Backgrounds                  |
| `fillStrong`       | `oklch(0.88 0.014 60 / 0.7)`      | Hover State                         |
| `separator`        | `oklch(0.85 0.008 60 / 0.4)`      | Hairlines                           |

## Farben — Dark Mode

| Token              | Wert                              |
|--------------------|-----------------------------------|
| `bg`               | `oklch(0.16 0.012 55)`            |
| `bgWash`           | `oklch(0.20 0.014 55)`            |
| `surface`          | `rgba(38, 32, 28, 0.55)`          |
| `surfaceSolid`     | `oklch(0.22 0.013 55)`            |
| `surfaceHigh`      | `rgba(48, 40, 35, 0.72)`          |
| `border`           | `oklch(0.32 0.01 60 / 0.45)`      |
| `borderStrong`     | `oklch(0.40 0.012 60 / 0.6)`      |
| `label`            | `oklch(0.97 0.005 70)`            |
| `secondary`        | `oklch(0.78 0.012 60)`            |
| `tertiary`         | `oklch(0.58 0.012 60)`            |
| `quaternary`       | `oklch(0.42 0.012 60)`            |
| `fill`             | `oklch(0.30 0.014 60 / 0.5)`      |
| `fillStrong`       | `oklch(0.38 0.016 60 / 0.7)`      |
| `separator`        | `oklch(0.32 0.01 60 / 0.5)`       |

## Akzent-Farben (beide Modi)

| Token          | Wert                       | Verwendung                       |
|----------------|----------------------------|----------------------------------|
| `primary`      | `oklch(0.72 0.17 55)`      | Brand-Orange — Buttons, Links    |
| `primaryDeep`  | `oklch(0.62 0.17 50)`      | Gradient-Endpunkt, Hover         |
| `primarySoft`  | `oklch(0.92 0.06 60)`      | Pill-Backgrounds (OBIS-Codes)    |
| `electricity`  | `oklch(0.78 0.16 80)`      | Strom-Typ                        |
| `gas`          | `oklch(0.72 0.14 35)`      | Gas-Typ                          |
| `water`        | `oklch(0.70 0.13 220)`     | Wasser-Typ                       |
| `oil`          | `oklch(0.55 0.10 40)`      | Heizöl-Typ                       |
| `green`        | `oklch(0.72 0.15 150)`     | Success / positive Delta         |
| `red`          | `oklch(0.65 0.20 25)`      | Error / negativer Status         |

## Schatten

```css
/* Light: Glas-Card */
box-shadow:
  0 1px 0 rgba(255,255,255,0.6) inset,
  0 1px 2px rgba(60,40,20,0.04),
  0 8px 24px rgba(60,40,20,0.06);

/* Dark: Glas-Card */
box-shadow:
  0 1px 0 rgba(255,255,255,0.04) inset,
  0 8px 24px rgba(0,0,0,0.3);

/* Primary Button */
box-shadow: 0 4px 12px <primary>55;

/* Type-Badge */
box-shadow:
  0 4px 12px <type-color>40,
  0 1px 0 rgba(255,255,255,0.3) inset;
```

## Glas-Effekt

```css
backdrop-filter: blur(40px) saturate(180%);
-webkit-backdrop-filter: blur(40px) saturate(180%);
```

## Radien

| Element                    | Radius |
|----------------------------|--------|
| Card                       | 20 px  |
| Button, Input, Pill (rect) | 10 px  |
| Pill (round)               | 9999 px|
| TypeBadge (sm 28px)        | 9 px (32% of dim) |
| Sheet top corners          | 28 px  |
| Avatar                     | 50%    |
| OBIS-Code Badge            | 6 px   |

## Typografie

```
font-family: 'Inter Tight', system-ui, -apple-system, sans-serif;
--font-mono: 'JetBrains Mono', ui-monospace, monospace;
```

| Style          | Size | Weight | Letter-Spacing | Use                         |
|----------------|------|--------|----------------|-----------------------------|
| Display        | 36px | 700    | -0.025em       | Page Titles Desktop         |
| Title 1        | 32px | 700    | -0.025em       | Admin Page Title            |
| Title 2        | 28px | 700    | -0.025em       | Mobile Page Title           |
| Title 3        | 22px | 700    | -0.02em        | Card Title gross            |
| Headline       | 18px | 700    | -0.02em        | Card Title                  |
| Body           | 14px | 500    | -0.005em       | Standard                    |
| Body Small     | 13px | 500    | normal         | Sekundär                    |
| Caption        | 12px | 500    | normal         | Labels                      |
| Caption Bold   | 12px | 600    | 0.08em         | Section Subtitle (UPPERCASE)|
| Micro          | 11px | 600    | 0.08em         | Table Headers (UPPERCASE)   |

**Zahlen immer:** `font-family: var(--font-mono); font-variant-numeric: tabular-nums;`

## Spacing

Folgt Tailwind-Default (4px-Step). Card-Padding: 18-22px. Section-Gap:
14-18px. Page-Padding Desktop: 28px vertikal × 40px horizontal.

## Hintergrund-Glows (Page Backgrounds)

Pro Page zwei Radial-Gradients absolut positioniert + `filter: blur(80px)`:

```jsx
{/* oben rechts */}
<div style={{
  position: 'absolute', top: -200, right: -100,
  width: 500, height: 500, borderRadius: '50%',
  background: `radial-gradient(circle, ${primary}30, transparent 70%)`,
  filter: 'blur(80px)', pointerEvents: 'none',
}} />
{/* unten links */}
<div style={{
  position: 'absolute', bottom: -200, left: 200,
  width: 500, height: 500, borderRadius: '50%',
  background: `radial-gradient(circle, ${electricity}20, transparent 70%)`,
  filter: 'blur(80px)', pointerEvents: 'none',
}} />
```

## Fokus-Ring

Auf Glasflächen ist der Standard-Browser-Outline kaum sichtbar. Setze
explizit:

```css
:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
  border-radius: inherit;
}
```
