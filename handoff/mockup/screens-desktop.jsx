// Desktop Variants - Sidebar Layout

const T3 = window.TOKENS;
const A3 = window.ACCENTS;
const TM3 = window.TYPE_META;
const M3 = window.MOCK_DATA;

function Sidebar({ active = 'dashboard', theme = 'light', isAdmin = true }) {
  const t = T3[theme];
  const items = [
    { id: 'dashboard', label: 'Dashboard', icon: 'M3 12L12 4l9 8M5 10v10h4v-6h6v6h4V10' },
    { id: 'erfassen', label: 'Erfassen', icon: 'M12 5v14M5 12h14' },
    { id: 'erfassungen', label: 'Erfassungen', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  ];
  const adminItems = [
    { id: 'messstellen', label: 'Messstellen', icon: 'M12 2v4M4.93 4.93l2.83 2.83M2 12h4M4.93 19.07l2.83-2.83M12 22v-4M19.07 19.07l-2.83-2.83M22 12h-4M19.07 4.93l-2.83 2.83' },
    { id: 'standorte', label: 'Standorte', icon: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0zM12 13a3 3 0 100-6 3 3 0 000 6z' },
    { id: 'benutzer', label: 'Benutzer', icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M13 7a4 4 0 11-8 0 4 4 0 018 0zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75' },
    { id: 'audit', label: 'Audit', icon: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8' },
  ];

  return (
    <aside style={{
      width: 240, flexShrink: 0,
      background: t.surface,
      backdropFilter: 'blur(40px) saturate(180%)',
      WebkitBackdropFilter: 'blur(40px) saturate(180%)',
      borderRight: `0.5px solid ${t.border}`,
      display: 'flex', flexDirection: 'column',
      padding: '20px 12px',
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px 18px' }}>
        <div style={{
          width: 32, height: 32, borderRadius: 9,
          background: `linear-gradient(135deg, ${A3.primary}, ${A3.primaryDeep})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 4px 12px ${A3.primary}55`,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', color: t.label }}>Zählerstand</div>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {items.map(it => (
          <NavItem key={it.id} {...it} active={active === it.id} theme={theme} />
        ))}

        {isAdmin && (
          <>
            <div style={{ fontSize: 10, color: t.tertiary, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, padding: '14px 10px 6px' }}>Administration</div>
            {adminItems.map(it => (
              <NavItem key={it.id} {...it} active={active === it.id} theme={theme} />
            ))}
          </>
        )}
      </nav>

      <div style={{ marginTop: 'auto', padding: '12px 8px', borderTop: `0.5px solid ${t.separator}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: `linear-gradient(135deg, ${A3.primary}, ${A3.primaryDeep})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontSize: 13, fontWeight: 700,
          }}>M</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: t.label }}>martin</div>
            <div style={{ fontSize: 10, color: t.tertiary }}>admin</div>
          </div>
          <button style={{ background: 'none', border: 'none', color: t.tertiary, fontSize: 16, cursor: 'pointer' }}>↪</button>
        </div>
      </div>
    </aside>
  );
}

function NavItem({ id, label, icon, active, theme }) {
  const t = T3[theme];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 10px', borderRadius: 10,
      background: active ? t.fill : 'transparent',
      color: active ? t.label : t.secondary,
      fontSize: 13.5, fontWeight: active ? 600 : 500,
      cursor: 'pointer',
      position: 'relative',
    }}>
      {active && <div style={{ position: 'absolute', left: -6, top: 8, bottom: 8, width: 3, borderRadius: 2, background: A3.primary }} />}
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: active ? 1 : 0.7 }}>
        <path d={icon} />
      </svg>
      {label}
    </div>
  );
}

// ───────── Desktop Dashboard A ─────────
function DashboardDesktopA({ theme = 'light' }) {
  const t = T3[theme];
  return (
    <div style={{ display: 'flex', height: '100%', background: t.bg, position: 'relative', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', top: -200, right: -100, width: 500, height: 500,
        borderRadius: '50%', background: `radial-gradient(circle, ${A3.primary}30, transparent 70%)`,
        filter: 'blur(80px)', pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: -200, left: 200, width: 500, height: 500,
        borderRadius: '50%', background: `radial-gradient(circle, ${A3.electricity}20, transparent 70%)`,
        filter: 'blur(80px)', pointerEvents: 'none',
      }} />

      <Sidebar theme={theme} active="dashboard" />

      <main style={{ flex: 1, padding: '28px 40px', overflowY: 'auto', position: 'relative' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 13, color: t.tertiary, fontWeight: 500, marginBottom: 2 }}>30. April 2026</div>
            <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-0.025em', color: t.label, lineHeight: 1.05 }}>Übersicht</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 10, background: t.fill, border: `0.5px solid ${t.border}` }}>
              {['Tag', 'Woche', 'Monat', 'Jahr'].map((p, i) => (
                <button key={p} style={{
                  padding: '6px 12px', borderRadius: 7, border: 'none',
                  background: i === 2 ? t.surfaceSolid : 'transparent',
                  color: i === 2 ? t.label : t.tertiary,
                  fontSize: 12, fontWeight: 600,
                  boxShadow: i === 2 ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}>{p}</button>
              ))}
            </div>
            <button style={{
              padding: '8px 14px', borderRadius: 10,
              background: `linear-gradient(135deg, ${A3.primary}, ${A3.primaryDeep})`,
              color: 'white', fontSize: 13, fontWeight: 600, border: 'none',
              boxShadow: `0 4px 12px ${A3.primary}55`,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>+ Erfassen</button>
          </div>
        </div>

        {/* KPI Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 18 }}>
          {[
            { type: 'electricity', label: 'Strom HT Bezug', value: '24.871,4', unit: 'kWh', delta: '+87,2', deltaPct: '+0,4 %' },
            { type: 'electricity', label: 'Einspeisung HT', value: '4.127,3', unit: 'kWh', delta: '+38,1', deltaPct: '+0,9 %', tone: 'positive' },
            { type: 'gas', label: 'Gas', value: '8.234,16', unit: 'm³', delta: '+35,7', deltaPct: '+0,4 %' },
            { type: 'water', label: 'Wasser', value: '412,87', unit: 'm³', delta: '+1,2', deltaPct: '+0,3 %' },
          ].map(k => (
            <window.GlassCard key={k.label} theme={theme} style={{ padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <window.TypeBadge type={k.type} theme={theme} size="sm" />
                <div style={{ fontSize: 11, fontWeight: 600, color: k.tone === 'positive' ? A3.green : t.tertiary, padding: '2px 7px', borderRadius: 999, background: k.tone === 'positive' ? `${A3.green}18` : t.fill }}>
                  {k.deltaPct}
                </div>
              </div>
              <div style={{ fontSize: 12, color: t.tertiary, fontWeight: 500, marginBottom: 4 }}>{k.label}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                <div style={{ fontSize: 26, fontWeight: 700, fontFamily: 'ui-monospace, monospace', letterSpacing: '-0.03em', color: t.label, fontFeatureSettings: '"tnum"' }}>
                  {k.value}
                </div>
                <div style={{ fontSize: 12, color: t.tertiary }}>{k.unit}</div>
              </div>
              <div style={{ fontSize: 11, color: t.tertiary, marginTop: 4 }}>seit 23.04. <span style={{ color: t.label, fontFamily: 'ui-monospace, monospace', fontWeight: 600 }}>{k.delta}</span></div>
            </window.GlassCard>
          ))}
        </div>

        {/* Big chart + side */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 18 }}>
          <window.GlassCard theme={theme} style={{ padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 13, color: t.tertiary, fontWeight: 500 }}>Stromverbrauch · 12 Monate</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                  <div style={{ fontSize: 30, fontWeight: 700, fontFamily: 'ui-monospace, monospace', letterSpacing: '-0.03em', color: t.label }}>4.247</div>
                  <div style={{ fontSize: 14, color: t.tertiary }}>kWh</div>
                  <div style={{ fontSize: 12, color: A3.green, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: `${A3.green}18` }}>−12 % YoY</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 14, fontSize: 11, color: t.secondary }}>
                <LegendDot color={A3.primary} label="HT Bezug" />
                <LegendDot color={A3.electricity} label="NT Bezug" />
                <LegendDot color={A3.water} label="Einspeisung" />
              </div>
            </div>
            <window.MultiAreaChart
              theme={theme} width={580} height={220}
              months={M3.consumption.electricity.map(c => c.m)}
              series={[
                { name: 'HT', data: M3.consumption.electricity.map(c => c.ht), color: A3.primary },
                { name: 'NT', data: M3.consumption.electricity.map(c => c.nt), color: A3.electricity },
                { name: 'E', data: M3.consumption.electricity.map(c => c.einsp), color: A3.water },
              ]}
            />
          </window.GlassCard>

          {/* Heizöl Tank */}
          <window.GlassCard theme={theme} style={{ padding: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <window.TypeBadge type="oil" theme={theme} size="sm" />
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: t.label }}>Heizöltank</div>
                <div style={{ fontSize: 11, color: t.tertiary }}>Keller · vor 4 Tagen</div>
              </div>
            </div>
            {/* Tank gauge */}
            <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
              <svg width="180" height="180" viewBox="0 0 180 180">
                <circle cx="90" cy="90" r="72" fill="none" stroke={t.fill} strokeWidth="14"/>
                <circle cx="90" cy="90" r="72" fill="none" stroke={A3.primary} strokeWidth="14"
                  strokeDasharray={`${0.71 * 2 * Math.PI * 72} ${2 * Math.PI * 72}`}
                  strokeLinecap="round" transform="rotate(-90 90 90)"
                  style={{ filter: `drop-shadow(0 0 8px ${A3.primary}80)` }}/>
                <text x="90" y="84" textAnchor="middle" fontSize="32" fontWeight="700" fill={t.label} fontFamily="ui-monospace, monospace" letterSpacing="-0.04em">2.840</text>
                <text x="90" y="104" textAnchor="middle" fontSize="11" fill={t.tertiary} fontWeight="500">von 4.000 L</text>
                <text x="90" y="122" textAnchor="middle" fontSize="13" fill={A3.primary} fontWeight="700">71 %</text>
              </svg>
            </div>
            <button style={{
              width: '100%', padding: 9, borderRadius: 10,
              background: `${A3.primary}15`, color: A3.primaryDeep,
              border: `0.5px solid ${A3.primary}30`,
              fontSize: 12, fontWeight: 600,
            }}>Lieferung erfassen</button>
          </window.GlassCard>
        </div>

        {/* Recent + Verbrauch summary */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <window.GlassCard theme={theme} style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: `0.5px solid ${t.separator}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: t.label }}>Letzte Erfassungen</div>
              <button style={{ fontSize: 12, color: A3.primary, background: 'none', border: 'none', fontWeight: 600 }}>Alle →</button>
            </div>
            {M3.recentReadings.slice(0, 5).map((r, i) => (
              <div key={i} style={{
                padding: '11px 20px', display: 'flex', alignItems: 'center', gap: 12,
                borderBottom: i < 4 ? `0.5px solid ${t.separator}` : 'none',
              }}>
                <window.TypeBadge type={typeOf2(r.mp)} theme={theme} size="sm" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: t.label }}>{r.mp}</div>
                  <div style={{ fontSize: 11, color: t.tertiary }}>{r.register} · {r.at} · {r.user}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, fontFamily: 'ui-monospace, monospace', color: t.label, fontFeatureSettings: '"tnum"' }}>{window.fmt(r.value)}</div>
                  <div style={{ fontSize: 10, color: t.tertiary }}>{r.unit}</div>
                </div>
              </div>
            ))}
          </window.GlassCard>

          <window.GlassCard theme={theme} style={{ padding: 22 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: t.label, marginBottom: 14 }}>Verbrauch im Monat</div>
            {[
              { type: 'electricity', label: 'Strom · HT + NT', value: 518, unit: 'kWh', max: 700 },
              { type: 'gas', label: 'Gas', value: 92, unit: 'm³', max: 250 },
              { type: 'water', label: 'Wasser', value: 12.2, unit: 'm³', max: 18 },
              { type: 'oil', label: 'Heizöl', value: 180, unit: 'L', max: 540 },
            ].map(b => {
              const pct = (b.value / b.max) * 100;
              return (
                <div key={b.label} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 12 }}>
                    <span style={{ color: t.secondary, fontWeight: 500 }}>{b.label}</span>
                    <span style={{ fontFamily: 'ui-monospace, monospace', color: t.label, fontWeight: 600 }}>
                      {window.fmt(b.value)} <span style={{ color: t.tertiary, fontWeight: 400 }}>{b.unit}</span>
                    </span>
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: t.fill, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${pct}%`,
                      background: `linear-gradient(90deg, ${TM3[b.type].color}, color-mix(in oklch, ${TM3[b.type].color}, ${A3.primary} 30%))`,
                      borderRadius: 999,
                    }} />
                  </div>
                </div>
              );
            })}
          </window.GlassCard>
        </div>
      </main>
    </div>
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

function typeOf2(name) {
  if (name.includes('Strom')) return 'electricity';
  if (name.includes('Gas')) return 'gas';
  if (name.includes('Wasser')) return 'water';
  return 'oil';
}

// ───────── Desktop Dashboard B - Detail-View pro Zähler ─────────
function DashboardDesktopB({ theme = 'light' }) {
  const t = T3[theme];
  return (
    <div style={{ display: 'flex', height: '100%', background: t.bg, position: 'relative', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', top: 100, right: -100, width: 400, height: 400,
        borderRadius: '50%', background: `radial-gradient(circle, ${A3.primary}30, transparent 70%)`,
        filter: 'blur(80px)', pointerEvents: 'none',
      }} />

      <Sidebar theme={theme} active="dashboard" />

      <main style={{ flex: 1, padding: '28px 40px', overflowY: 'auto', position: 'relative' }}>
        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: t.tertiary, marginBottom: 12 }}>
          <span>Dashboard</span>
          <span>›</span>
          <span style={{ color: t.label, fontWeight: 600 }}>Hauptzähler Strom</span>
        </div>

        {/* Title with monster number */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24, marginBottom: 28 }}>
          <window.TypeBadge type="electricity" theme={theme} size="lg" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: t.tertiary, fontWeight: 500 }}>HAUPTZÄHLER STROM · KELLER · DUAL TARIF · BIDIREKTIONAL</div>
            <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.025em', color: t.label, marginTop: 2 }}>Hauptzähler Strom</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ padding: '8px 14px', borderRadius: 10, background: t.fill, border: `0.5px solid ${t.border}`, fontSize: 12, fontWeight: 600, color: t.label }}>Zählerwechsel</button>
            <button style={{ padding: '8px 14px', borderRadius: 10, background: `linear-gradient(135deg, ${A3.primary}, ${A3.primaryDeep})`, color: 'white', border: 'none', fontSize: 12, fontWeight: 600, boxShadow: `0 4px 12px ${A3.primary}55` }}>+ Erfassen</button>
          </div>
        </div>

        {/* Big numbers row - register states */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 18 }}>
          {[
            { label: 'HT Bezug · 1.8.1', value: '24.871', frac: ',4', unit: 'kWh', delta: '+87,2', avg: '12,4 kWh/Tag', primary: true },
            { label: 'NT Bezug · 1.8.2', value: '18.234', frac: ',7', unit: 'kWh', delta: '+42,3', avg: '6,0 kWh/Tag' },
            { label: 'Einsp. HT · 2.8.1', value: '4.127', frac: ',3', unit: 'kWh', delta: '+38,1', avg: '5,4 kWh/Tag' },
          ].map(r => (
            <window.GlassCard key={r.label} theme={theme} style={{ padding: 22, position: 'relative', overflow: 'hidden' }}>
              {r.primary && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${A3.primary}, ${A3.electricity})` }} />}
              <div style={{ fontSize: 11, color: t.tertiary, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 8 }}>{r.label}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <div style={{ fontSize: 44, fontWeight: 700, fontFamily: 'ui-monospace, "JetBrains Mono", monospace', letterSpacing: '-0.04em', color: t.label, fontFeatureSettings: '"tnum"', lineHeight: 1 }}>{r.value}</div>
                <div style={{ fontSize: 24, fontWeight: 600, color: t.tertiary, fontFamily: 'ui-monospace, monospace' }}>{r.frac}</div>
                <div style={{ fontSize: 13, color: t.secondary, marginLeft: 4 }}>{r.unit}</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 12 }}>
                <span style={{ color: A3.green, fontWeight: 600 }}>{r.delta} kWh</span>
                <span style={{ color: t.tertiary }}>⌀ {r.avg}</span>
              </div>
            </window.GlassCard>
          ))}
        </div>

        {/* Big chart */}
        <window.GlassCard theme={theme} style={{ padding: 22, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: t.label }}>Tagesverbrauch · letzte 12 Monate</div>
            <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 10, background: t.fill }}>
              {['Verbrauch', 'Stand'].map((p, i) => (
                <button key={p} style={{
                  padding: '5px 12px', borderRadius: 6, border: 'none',
                  background: i === 0 ? t.surfaceSolid : 'transparent',
                  color: i === 0 ? t.label : t.tertiary,
                  fontSize: 11, fontWeight: 600,
                }}>{p}</button>
              ))}
            </div>
          </div>
          <window.MultiAreaChart
            theme={theme} width={920} height={260}
            months={M3.consumption.electricity.map(c => c.m)}
            series={[
              { name: 'HT', data: M3.consumption.electricity.map(c => c.ht), color: A3.primary },
              { name: 'NT', data: M3.consumption.electricity.map(c => c.nt), color: A3.electricity },
              { name: 'E', data: M3.consumption.electricity.map(c => c.einsp), color: A3.water },
            ]}
          />
        </window.GlassCard>
      </main>
    </div>
  );
}

window.DashboardDesktopA = DashboardDesktopA;
window.DashboardDesktopB = DashboardDesktopB;
window.Sidebar = Sidebar;
