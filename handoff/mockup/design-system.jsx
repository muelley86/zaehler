// Liquid Glass Design System für Zähler-App
// Warmes Orange + Apple-inspirierte Glasflächen

const TOKENS = {
  light: {
    // Warmer Off-White Hintergrund mit subtilen Verläufen
    bg: 'oklch(0.985 0.006 70)',
    bgWash: 'oklch(0.97 0.012 60)',
    surface: 'rgba(255, 252, 248, 0.72)',
    surfaceSolid: 'oklch(0.99 0.004 70)',
    surfaceHigh: 'rgba(255, 253, 250, 0.85)',
    border: 'oklch(0.88 0.008 60 / 0.5)',
    borderStrong: 'oklch(0.82 0.01 60 / 0.6)',
    label: 'oklch(0.18 0.01 60)',
    secondary: 'oklch(0.42 0.012 60)',
    tertiary: 'oklch(0.62 0.012 60)',
    quaternary: 'oklch(0.78 0.01 60)',
    fill: 'oklch(0.92 0.012 60 / 0.5)',
    fillStrong: 'oklch(0.88 0.014 60 / 0.7)',
    separator: 'oklch(0.85 0.008 60 / 0.4)',
  },
  dark: {
    bg: 'oklch(0.16 0.012 55)',
    bgWash: 'oklch(0.20 0.014 55)',
    surface: 'rgba(38, 32, 28, 0.55)',
    surfaceSolid: 'oklch(0.22 0.013 55)',
    surfaceHigh: 'rgba(48, 40, 35, 0.72)',
    border: 'oklch(0.32 0.01 60 / 0.45)',
    borderStrong: 'oklch(0.40 0.012 60 / 0.6)',
    label: 'oklch(0.97 0.005 70)',
    secondary: 'oklch(0.78 0.012 60)',
    tertiary: 'oklch(0.58 0.012 60)',
    quaternary: 'oklch(0.42 0.012 60)',
    fill: 'oklch(0.30 0.014 60 / 0.5)',
    fillStrong: 'oklch(0.38 0.016 60 / 0.7)',
    separator: 'oklch(0.32 0.01 60 / 0.5)',
  },
};

// Akzentfarben - warmes Orange ist primär, pro Typ ein Hue-Shift
const ACCENTS = {
  primary: 'oklch(0.72 0.17 55)', // warmes Orange
  primaryDeep: 'oklch(0.62 0.17 50)',
  primarySoft: 'oklch(0.92 0.06 60)',
  electricity: 'oklch(0.78 0.16 80)', // warmes Gelb-Orange
  gas: 'oklch(0.72 0.14 35)', // tieferes Orange-Rot
  water: 'oklch(0.70 0.13 220)', // gedämpftes Blau
  oil: 'oklch(0.55 0.10 40)', // Brown
  green: 'oklch(0.72 0.15 150)',
  red: 'oklch(0.65 0.20 25)',
};

const TYPE_META = {
  electricity: { label: 'Strom', symbol: '⚡', color: ACCENTS.electricity, unit: 'kWh' },
  gas: { label: 'Gas', symbol: '◉', color: ACCENTS.gas, unit: 'm³' },
  water: { label: 'Wasser', symbol: '◈', color: ACCENTS.water, unit: 'm³' },
  oil: { label: 'Heizöl', symbol: '◆', color: ACCENTS.oil, unit: 'L' },
};

// Mock-Daten basierend auf echten Types aus types.ts
const MOCK_DATA = {
  measuringPoints: [
    {
      id: 1, name: 'Hauptzähler Strom', type: 'electricity', location_name: 'Keller',
      has_dual_tariff: true, is_bidirectional: true,
      registers: [
        { obis: '1.8.1', label: 'HT Bezug', unit: 'kWh', current: 24871.4, last_at: '2026-04-30 18:42' },
        { obis: '1.8.2', label: 'NT Bezug', unit: 'kWh', current: 18234.7, last_at: '2026-04-30 18:42' },
        { obis: '2.8.1', label: 'HT Einspeisung', unit: 'kWh', current: 4127.3, last_at: '2026-04-30 18:42' },
      ],
    },
    {
      id: 2, name: 'Gaszähler', type: 'gas', location_name: 'Keller',
      registers: [
        { obis: '7.8.0', label: 'Gas', unit: 'm³', current: 8234.156, last_at: '2026-04-30 18:45' },
      ],
    },
    {
      id: 3, name: 'Wasseruhr Haus', type: 'water', location_name: 'Keller',
      registers: [
        { obis: 'water', label: 'Wasser', unit: 'm³', current: 412.873, last_at: '2026-04-29 09:12' },
      ],
    },
    {
      id: 4, name: 'Heizöltank', type: 'oil', location_name: 'Keller',
      tank_capacity: 4000,
      registers: [
        { obis: 'oil', label: 'Tankstand', unit: 'L', current: 2840, last_at: '2026-04-28 14:00', accepts_deliveries: true },
      ],
    },
  ],
  recentReadings: [
    { mp: 'Hauptzähler Strom', register: 'HT Bezug', value: 24871.4, unit: 'kWh', at: '30.04.2026 18:42', user: 'martin' },
    { mp: 'Hauptzähler Strom', register: 'NT Bezug', value: 18234.7, unit: 'kWh', at: '30.04.2026 18:42', user: 'martin' },
    { mp: 'Gaszähler', register: 'Gas', value: 8234.156, unit: 'm³', at: '30.04.2026 18:45', user: 'martin' },
    { mp: 'Wasseruhr Haus', register: 'Wasser', value: 412.873, unit: 'm³', at: '29.04.2026 09:12', user: 'sabine' },
    { mp: 'Heizöltank', register: 'Tankstand', value: 2840, unit: 'L', at: '28.04.2026 14:00', user: 'martin' },
    { mp: 'Hauptzähler Strom', register: 'HT Bezug', value: 24784.2, unit: 'kWh', at: '23.04.2026 19:10', user: 'martin' },
    { mp: 'Gaszähler', register: 'Gas', value: 8198.420, unit: 'm³', at: '23.04.2026 19:14', user: 'martin' },
  ],
  // Zeitreihen für charts: 12 Monate
  consumption: {
    electricity: [
      { m: 'Mai', ht: 312, nt: 198, einsp: 142 },
      { m: 'Jun', ht: 298, nt: 184, einsp: 178 },
      { m: 'Jul', ht: 285, nt: 172, einsp: 215 },
      { m: 'Aug', ht: 290, nt: 175, einsp: 198 },
      { m: 'Sep', ht: 305, nt: 188, einsp: 142 },
      { m: 'Okt', ht: 340, nt: 218, einsp: 88 },
      { m: 'Nov', ht: 388, nt: 245, einsp: 42 },
      { m: 'Dez', ht: 425, nt: 268, einsp: 28 },
      { m: 'Jan', ht: 442, nt: 274, einsp: 35 },
      { m: 'Feb', ht: 398, nt: 248, einsp: 58 },
      { m: 'Mär', ht: 358, nt: 222, einsp: 112 },
      { m: 'Apr', ht: 320, nt: 198, einsp: 168 },
    ],
    gas: [42, 38, 32, 28, 35, 68, 142, 218, 254, 232, 168, 92],
    water: [11.2, 12.4, 13.8, 14.2, 12.8, 11.4, 10.8, 10.2, 10.4, 11.0, 11.8, 12.2],
    oil: [180, 120, 80, 60, 80, 180, 320, 480, 540, 480, 320, 180],
  },
};

window.TOKENS = TOKENS;
window.ACCENTS = ACCENTS;
window.TYPE_META = TYPE_META;
window.MOCK_DATA = MOCK_DATA;

// ───────────────────────── Glass-Komponenten ─────────────────────────

function GlassCard({ children, style = {}, className = '', tone, hover = false, theme = 'light', ...rest }) {
  const t = TOKENS[theme];
  return (
    <div
      className={className}
      style={{
        background: tone || t.surface,
        backdropFilter: 'blur(40px) saturate(180%)',
        WebkitBackdropFilter: 'blur(40px) saturate(180%)',
        border: `0.5px solid ${t.border}`,
        borderRadius: 20,
        boxShadow: theme === 'dark'
          ? '0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.3)'
          : '0 1px 0 rgba(255,255,255,0.6) inset, 0 1px 2px rgba(60,40,20,0.04), 0 8px 24px rgba(60,40,20,0.06)',
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

function Pill({ children, active, onClick, theme = 'light', tone, style = {} }) {
  const t = TOKENS[theme];
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 12px',
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 500,
        letterSpacing: '-0.01em',
        background: active ? (tone || ACCENTS.primary) : t.fill,
        color: active ? '#fff' : t.secondary,
        border: `0.5px solid ${active ? 'transparent' : t.border}`,
        cursor: 'pointer',
        transition: 'all 0.15s',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function TypeBadge({ type, theme = 'light', size = 'md' }) {
  const meta = TYPE_META[type];
  const t = TOKENS[theme];
  const dim = size === 'sm' ? 28 : size === 'lg' ? 48 : 36;
  return (
    <div style={{
      width: dim, height: dim, borderRadius: dim * 0.32,
      background: `linear-gradient(135deg, ${meta.color}, color-mix(in oklch, ${meta.color}, transparent 30%))`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'white', fontSize: size === 'sm' ? 13 : size === 'lg' ? 22 : 16,
      fontWeight: 600, flexShrink: 0,
      boxShadow: `0 4px 12px ${meta.color}40, 0 1px 0 rgba(255,255,255,0.3) inset`,
    }}>
      {meta.symbol}
    </div>
  );
}

window.GlassCard = GlassCard;
window.Pill = Pill;
window.TypeBadge = TypeBadge;

// ───────────────────────── Sparkline + AreaChart ─────────────────────────

function AreaChart({ data, height = 80, width = 280, color = ACCENTS.primary, theme = 'light', showAxis = false, fill = true }) {
  const t = TOKENS[theme];
  const max = Math.max(...data) * 1.1;
  const min = Math.min(...data, 0);
  const pad = showAxis ? 28 : 4;
  const chartW = width - pad * 2;
  const chartH = height - pad * 2;
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * chartW;
    const y = pad + chartH - ((v - min) / (max - min)) * chartH;
    return [x, y];
  });
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L ${pts[pts.length - 1][0].toFixed(1)} ${pad + chartH} L ${pts[0][0].toFixed(1)} ${pad + chartH} Z`;
  const id = `grad-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <svg width={width} height={height} style={{ display: 'block', maxWidth: '100%' }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.45" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={area} fill={`url(#${id})`} />}
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map(([x, y], i) => i === pts.length - 1 ? (
        <circle key={i} cx={x} cy={y} r={3.5} fill={color} stroke={t.surfaceSolid} strokeWidth="2" />
      ) : null)}
    </svg>
  );
}

function MultiAreaChart({ series, height = 200, width = 600, theme = 'light', months }) {
  const t = TOKENS[theme];
  const allValues = series.flatMap(s => s.data);
  const max = Math.max(...allValues) * 1.15;
  const pad = { top: 16, right: 16, bottom: 28, left: 40 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const len = series[0].data.length;

  const yTicks = 4;
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => (max / yTicks) * i);

  return (
    <svg width={width} height={height} style={{ display: 'block', maxWidth: '100%' }}>
      <defs>
        {series.map((s, idx) => (
          <linearGradient key={idx} id={`g-${idx}-${s.name}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity="0.4" />
            <stop offset="100%" stopColor={s.color} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>

      {/* Grid */}
      {ticks.map((v, i) => {
        const y = pad.top + chartH - (v / max) * chartH;
        return (
          <g key={i}>
            <line x1={pad.left} y1={y} x2={pad.left + chartW} y2={y} stroke={t.separator} strokeDasharray="2 4" />
            <text x={pad.left - 8} y={y + 3} textAnchor="end" fontSize="10" fill={t.tertiary} fontFamily="ui-monospace, monospace">
              {Math.round(v)}
            </text>
          </g>
        );
      })}

      {/* X-Labels */}
      {months && months.map((m, i) => {
        if (i % 2 !== 0) return null;
        const x = pad.left + (i / (len - 1)) * chartW;
        return (
          <text key={i} x={x} y={height - 8} textAnchor="middle" fontSize="10" fill={t.tertiary}>
            {m}
          </text>
        );
      })}

      {/* Series */}
      {series.map((s, idx) => {
        const pts = s.data.map((v, i) => {
          const x = pad.left + (i / (len - 1)) * chartW;
          const y = pad.top + chartH - (v / max) * chartH;
          return [x, y];
        });
        const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
        const area = `${line} L ${pts[pts.length - 1][0].toFixed(1)} ${pad.top + chartH} L ${pts[0][0].toFixed(1)} ${pad.top + chartH} Z`;
        return (
          <g key={idx}>
            <path d={area} fill={`url(#g-${idx}-${s.name})`} />
            <path d={line} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" />
          </g>
        );
      })}
    </svg>
  );
}

window.AreaChart = AreaChart;
window.MultiAreaChart = MultiAreaChart;

// Number formatter
function fmt(n, opts = {}) {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3, ...opts }).format(n);
}
function fmtInt(n) { return fmt(n, { maximumFractionDigits: 0 }); }

window.fmt = fmt;
window.fmtInt = fmtInt;
