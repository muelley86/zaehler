// Mobile Screens für Zähler App - Liquid Glass Style
// Variante A: Card-fokussiert, Variante B: Hero-Number-fokussiert

const M = window.MOCK_DATA;
const T = window.TOKENS;
const A = window.ACCENTS;
const TM = window.TYPE_META;

// ───────────────────────── Background mit Glow ─────────────────────────
function GlowBg({ theme = 'light', children, style = {} }) {
  const t = T[theme];
  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      background: t.bg,
      overflow: 'hidden',
      ...style,
    }}>
      {/* Warme orange Lichter */}
      <div style={{
        position: 'absolute', top: -120, right: -80, width: 320, height: 320,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${A.primary}55, transparent 70%)`,
        filter: 'blur(60px)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: -100, left: -120, width: 360, height: 360,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${A.electricity}33, transparent 70%)`,
        filter: 'blur(80px)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', top: '40%', left: '30%', width: 240, height: 240,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${A.water}22, transparent 70%)`,
        filter: 'blur(70px)',
        pointerEvents: 'none',
      }} />
      <div style={{ position: 'relative', height: '100%', zIndex: 1 }}>
        {children}
      </div>
    </div>
  );
}

// ───────────────────────── Mobile Status Bar ─────────────────────────
function StatusBar({ theme }) {
  const t = T[theme];
  return (
    <div style={{
      height: 44, paddingTop: 12,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 24px 0',
      fontSize: 15, fontWeight: 600, color: t.label,
      fontFeatureSettings: '"tnum"',
    }}>
      <span>9:41</span>
      <span style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
        <svg width="17" height="11" viewBox="0 0 17 11" fill="none">
          <rect x="0.5" y="2" width="3" height="7" rx="1" fill="currentColor" opacity="0.5"/>
          <rect x="4.5" y="0" width="3" height="9" rx="1" fill="currentColor" opacity="0.7"/>
          <rect x="8.5" y="-1" width="3" height="11" rx="1" fill="currentColor"/>
          <rect x="12.5" y="-2" width="3" height="13" rx="1" fill="currentColor"/>
        </svg>
        <svg width="16" height="11" viewBox="0 0 16 11" fill="none">
          <path d="M8 2C5.5 2 3.3 2.9 1.6 4.4L0 2.8C2.1 0.9 4.9 0 8 0C11.1 0 13.9 0.9 16 2.8L14.4 4.4C12.7 2.9 10.5 2 8 2ZM8 6C6.6 6 5.4 6.5 4.4 7.4L2.8 5.8C4.2 4.5 6 3.7 8 3.7C10 3.7 11.8 4.5 13.2 5.8L11.6 7.4C10.6 6.5 9.4 6 8 6ZM8 9.6C8.9 9.6 9.6 10.3 9.6 11H6.4C6.4 10.3 7.1 9.6 8 9.6Z" fill="currentColor"/>
        </svg>
        <svg width="25" height="11" viewBox="0 0 25 11" fill="none">
          <rect x="1" y="1.5" width="20" height="8" rx="2" stroke="currentColor" strokeOpacity="0.5" fill="none"/>
          <rect x="2.5" y="3" width="15" height="5" rx="1" fill="currentColor"/>
          <rect x="22" y="4" width="2" height="3" rx="0.5" fill="currentColor" opacity="0.5"/>
        </svg>
      </span>
    </div>
  );
}

// ───────────────────────── Bottom Tab Bar (Mobile) ─────────────────────────
function TabBar({ active, theme }) {
  const t = T[theme];
  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: 'M3 12L12 4l9 8M5 10v10h4v-6h6v6h4V10' },
    { id: 'erfassen', label: 'Erfassen', icon: 'M12 5v14M5 12h14' },
    { id: 'erfassungen', label: 'Verlauf', icon: 'M3 6h18M3 12h18M3 18h18' },
    { id: 'mehr', label: 'Mehr', icon: 'M5 12h.01M12 12h.01M19 12h.01' },
  ];
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      paddingBottom: 28, paddingTop: 8,
      background: theme === 'dark' ? 'rgba(28,24,22,0.78)' : 'rgba(255,253,250,0.78)',
      backdropFilter: 'blur(40px) saturate(180%)',
      WebkitBackdropFilter: 'blur(40px) saturate(180%)',
      borderTop: `0.5px solid ${t.border}`,
      display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr',
    }}>
      {tabs.map(tab => (
        <button key={tab.id} style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
          padding: '6px 4px',
          background: 'none', border: 'none',
          color: active === tab.id ? A.primary : t.tertiary,
          fontSize: 10, fontWeight: 500,
        }}>
          {tab.id === 'erfassen' ? (
            <div style={{
              width: 36, height: 36, borderRadius: 12,
              background: active === tab.id ? A.primary : `linear-gradient(135deg, ${A.primary}, ${A.primaryDeep})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white',
              boxShadow: `0 4px 14px ${A.primary}55`,
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d={tab.icon} />
              </svg>
            </div>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d={tab.icon} />
            </svg>
          )}
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );
}

// ───────────────────────── A) Dashboard - Card-fokussiert ─────────────────────────
function DashboardA({ theme = 'light' }) {
  const t = T[theme];
  return (
    <GlowBg theme={theme}>
      <StatusBar theme={theme} />
      <div style={{ padding: '4px 20px 110px', overflowY: 'auto', height: 'calc(100% - 44px)' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 8 }}>
          <div>
            <div style={{ fontSize: 13, color: t.tertiary, fontWeight: 500, letterSpacing: '0.01em' }}>30. April 2026</div>
            <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.025em', color: t.label, lineHeight: 1.1 }}>Übersicht</div>
          </div>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: `linear-gradient(135deg, ${A.primary}, ${A.primaryDeep})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontSize: 14, fontWeight: 600,
          }}>M</div>
        </div>

        {/* Periode */}
        <div style={{ display: 'flex', gap: 6, marginTop: 16, marginBottom: 14 }}>
          {['Woche', 'Monat', 'Jahr'].map((p, i) => (
            <window.Pill key={p} active={i === 1} theme={theme}>{p}</window.Pill>
          ))}
        </div>

        {/* Hero Card: Heizöl Tank */}
        <window.GlassCard theme={theme} style={{ padding: 20, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <window.TypeBadge type="oil" theme={theme} size="sm" />
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: t.label, letterSpacing: '-0.01em' }}>Heizöltank</div>
                <div style={{ fontSize: 11, color: t.tertiary, marginTop: 1 }}>Keller · vor 4 Tagen</div>
              </div>
            </div>
            <div style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, background: A.primarySoft, color: A.primaryDeep, fontWeight: 600 }}>
              71 %
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 12 }}>
            <div style={{ fontSize: 42, fontWeight: 700, fontFamily: 'ui-monospace, "JetBrains Mono", monospace', letterSpacing: '-0.04em', color: t.label, fontFeatureSettings: '"tnum"' }}>
              2.840
            </div>
            <div style={{ fontSize: 16, color: t.secondary, fontWeight: 500 }}>L</div>
            <div style={{ marginLeft: 'auto', fontSize: 12, color: t.tertiary, fontFamily: 'ui-monospace, monospace' }}>/ 4.000 L</div>
          </div>

          {/* Tank-Visualisierung */}
          <div style={{
            height: 12, borderRadius: 999, background: t.fill,
            overflow: 'hidden', position: 'relative',
            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06)',
          }}>
            <div style={{
              height: '100%', width: '71%',
              background: `linear-gradient(90deg, ${A.primary}, ${A.electricity})`,
              borderRadius: 999,
              boxShadow: `0 0 12px ${A.primary}80`,
            }} />
          </div>
        </window.GlassCard>

        {/* Strom Cards Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <SmallStatCard theme={theme} type="electricity" label="Strom HT" value="24.871" unit="kWh" delta="+87,2 seit 23.04." chart={[210, 234, 218, 242, 268, 285, 298]} />
          <SmallStatCard theme={theme} type="electricity" label="Einspeisung" value="4.127" unit="kWh" delta="+38,1 seit 23.04." chart={[120, 142, 168, 158, 178, 198, 168]} positive />
        </div>

        {/* Gas + Wasser */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <SmallStatCard theme={theme} type="gas" label="Gas" value="8.234" unit="m³" delta="+35,7 in 7T" chart={[28, 32, 35, 42, 38, 42, 36]} />
          <SmallStatCard theme={theme} type="water" label="Wasser" value="412,9" unit="m³" delta="+1,2 in 7T" chart={[10, 12, 11, 13, 12, 14, 12]} />
        </div>

        {/* Verbrauch Chart */}
        <window.GlassCard theme={theme} style={{ padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <div style={{ fontSize: 13, color: t.tertiary, fontWeight: 500 }}>Strom · 12 Monate</div>
            <div style={{ fontSize: 11, color: t.tertiary }}>kWh</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 12 }}>
            <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'ui-monospace, monospace', letterSpacing: '-0.03em', color: t.label }}>
              4.247
            </div>
            <div style={{ fontSize: 13, color: A.green, fontWeight: 600 }}>−12 % YoY</div>
          </div>
          <window.MultiAreaChart
            theme={theme}
            width={300}
            height={140}
            months={M.consumption.electricity.map(c => c.m)}
            series={[
              { name: 'HT', data: M.consumption.electricity.map(c => c.ht), color: A.primary },
              { name: 'NT', data: M.consumption.electricity.map(c => c.nt), color: A.electricity },
              { name: 'Einspeisung', data: M.consumption.electricity.map(c => c.einsp), color: A.water },
            ]}
          />
          <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 11, color: t.secondary }}>
            <LegendDot color={A.primary} label="HT" />
            <LegendDot color={A.electricity} label="NT" />
            <LegendDot color={A.water} label="Einspeisung" />
          </div>
        </window.GlassCard>
      </div>
      <TabBar active="dashboard" theme={theme} />
    </GlowBg>
  );
}

function SmallStatCard({ theme, type, label, value, unit, delta, chart, positive }) {
  const t = T[theme];
  const meta = TM[type];
  return (
    <window.GlassCard theme={theme} style={{ padding: 14, position: 'relative', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <window.TypeBadge type={type} theme={theme} size="sm" />
        <div style={{ fontSize: 10, color: t.tertiary, textAlign: 'right', maxWidth: 90 }}>{delta}</div>
      </div>
      <div style={{ fontSize: 11, color: t.tertiary, fontWeight: 500, marginBottom: 2 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'ui-monospace, monospace', letterSpacing: '-0.03em', color: t.label, fontFeatureSettings: '"tnum"' }}>
          {value}
        </div>
        <div style={{ fontSize: 11, color: t.tertiary }}>{unit}</div>
      </div>
      <div style={{ marginTop: 8, marginLeft: -4, marginRight: -4 }}>
        <window.AreaChart data={chart} width={140} height={36} color={meta.color} theme={theme} />
      </div>
    </window.GlassCard>
  );
}

function LegendDot({ color, label }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
      {label}
    </span>
  );
}

// ───────────────────────── B) Dashboard - Hero Number ─────────────────────────
function DashboardB({ theme = 'light' }) {
  const t = T[theme];
  return (
    <GlowBg theme={theme}>
      <StatusBar theme={theme} />
      <div style={{ padding: '8px 20px 110px', overflowY: 'auto', height: 'calc(100% - 44px)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em', color: t.label }}>Zähler</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <IconBtn theme={theme} icon="filter" />
            <IconBtn theme={theme} icon="user" />
          </div>
        </div>

        {/* Hero: Aktiver Zähler mit Riesenzahl */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: t.tertiary, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 6 }}>
            HAUPTZÄHLER STROM · HT
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
            <div style={{
              fontSize: 64, fontWeight: 700, lineHeight: 0.95,
              fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
              letterSpacing: '-0.05em',
              color: t.label,
              fontFeatureSettings: '"tnum"',
              background: `linear-gradient(180deg, ${t.label}, ${t.secondary})`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              24.871
            </div>
            <div style={{ fontSize: 22, fontWeight: 600, color: t.tertiary, letterSpacing: '-0.02em' }}>,4</div>
            <div style={{ fontSize: 18, color: t.secondary, fontWeight: 500, marginLeft: 4 }}>kWh</div>
          </div>
          <div style={{ fontSize: 13, color: t.tertiary }}>
            Letzter Stand vor 7 Tagen · <span style={{ color: A.primary, fontWeight: 600 }}>+87,2 kWh</span>
          </div>
        </div>

        {/* Carousel Indicator */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{
              height: 3, borderRadius: 2, flex: 1,
              background: i === 0 ? A.primary : t.fill,
            }} />
          ))}
        </div>

        {/* Big Chart */}
        <window.GlassCard theme={theme} style={{ padding: 16, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: t.tertiary, fontWeight: 600 }}>VERBRAUCH PRO TAG</div>
            <div style={{ display: 'flex', gap: 4 }}>
              <Pill theme={theme} active>7T</Pill>
              <Pill theme={theme}>30T</Pill>
              <Pill theme={theme}>1J</Pill>
            </div>
          </div>
          <window.MultiAreaChart
            theme={theme} width={300} height={160}
            months={['25.', '26.', '27.', '28.', '29.', '30.', 'h.']}
            series={[
              { name: 'verbrauch', data: [12.4, 11.8, 13.2, 14.6, 12.9, 15.4, 13.8], color: A.primary },
            ]}
          />
        </window.GlassCard>

        {/* Quick Tiles aller Zähler */}
        <div style={{ fontSize: 12, color: t.tertiary, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 8, marginTop: 6 }}>
          Alle Zähler
        </div>

        {[
          { type: 'electricity', name: 'Strom NT', value: '18.234,7', unit: 'kWh', sub: 'Bezug · vor 7T' },
          { type: 'gas', name: 'Gas', value: '8.234,16', unit: 'm³', sub: 'Hauszähler · vor 7T' },
          { type: 'water', name: 'Wasser', value: '412,87', unit: 'm³', sub: 'Hauszähler · vor 8T' },
        ].map(z => (
          <div key={z.name} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 14px', marginBottom: 8,
            background: T[theme].surface,
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            border: `0.5px solid ${T[theme].border}`,
            borderRadius: 18,
          }}>
            <window.TypeBadge type={z.type} theme={theme} size="sm" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: t.label, letterSpacing: '-0.01em' }}>{z.name}</div>
              <div style={{ fontSize: 11, color: t.tertiary, marginTop: 1 }}>{z.sub}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 17, fontWeight: 700, fontFamily: 'ui-monospace, monospace', letterSpacing: '-0.02em', color: t.label, fontFeatureSettings: '"tnum"' }}>
                {z.value}
              </div>
              <div style={{ fontSize: 10, color: t.tertiary }}>{z.unit}</div>
            </div>
          </div>
        ))}
      </div>
      <TabBar active="dashboard" theme={theme} />
    </GlowBg>
  );
}

function IconBtn({ theme, icon }) {
  const t = T[theme];
  const paths = {
    filter: 'M3 6h18M7 12h10M10 18h4',
    user: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M16 7a4 4 0 11-8 0 4 4 0 018 0z',
    plus: 'M12 5v14M5 12h14',
  };
  return (
    <button style={{
      width: 36, height: 36, borderRadius: '50%',
      background: t.fill,
      border: `0.5px solid ${t.border}`,
      backdropFilter: 'blur(20px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: t.label,
    }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={paths[icon]} />
      </svg>
    </button>
  );
}

window.DashboardA = DashboardA;
window.DashboardB = DashboardB;
window.GlowBg = GlowBg;
window.StatusBar = StatusBar;
window.TabBar = TabBar;
window.IconBtn = IconBtn;
