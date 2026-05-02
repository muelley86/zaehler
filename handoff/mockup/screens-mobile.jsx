// Erfassen, Liste, Login, Mehr — Mobile Screens

const M2 = window.MOCK_DATA;
const T2 = window.TOKENS;
const A2 = window.ACCENTS;
const TM2 = window.TYPE_META;

// ───────────────────────── Erfassen Sheet ─────────────────────────
function ErfassenA({ theme = 'light' }) {
  const t = T2[theme];
  return (
    <window.GlowBg theme={theme}>
      <window.StatusBar theme={theme} />
      {/* Hintergrund: ged immte Liste-Vorschau */}
      <div style={{ padding: '8px 20px', opacity: 0.35, pointerEvents: 'none' }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: t.label, marginBottom: 12 }}>Erfassen</div>
      </div>

      {/* Modal Sheet */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: theme === 'dark' ? 'rgba(36,30,26,0.85)' : 'rgba(255,253,250,0.88)',
        backdropFilter: 'blur(50px) saturate(200%)',
        WebkitBackdropFilter: 'blur(50px) saturate(200%)',
        borderTopLeftRadius: 28, borderTopRightRadius: 28,
        border: `0.5px solid ${t.border}`,
        borderBottom: 'none',
        padding: '12px 20px 28px',
        boxShadow: '0 -10px 40px rgba(0,0,0,0.15)',
        maxHeight: '85%',
        overflowY: 'auto',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: t.fillStrong }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <button style={{ fontSize: 15, color: A2.primary, background: 'none', border: 'none', fontWeight: 500 }}>Abbrechen</button>
          <div style={{ fontSize: 15, fontWeight: 600, color: t.label }}>Neue Erfassung</div>
          <button style={{ fontSize: 15, color: A2.primary, background: 'none', border: 'none', fontWeight: 700 }}>Sichern</button>
        </div>

        {/* Zähler-Auswahl als Karussell */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: t.tertiary, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 10 }}>
            Zähler wählen
          </div>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
            {[
              { type: 'electricity', name: 'Strom', active: true },
              { type: 'gas', name: 'Gas' },
              { type: 'water', name: 'Wasser' },
              { type: 'oil', name: 'Heizöl' },
            ].map(z => (
              <div key={z.name} style={{
                padding: '12px 14px', borderRadius: 16,
                background: z.active ? `linear-gradient(135deg, ${TM2[z.type].color}, color-mix(in oklch, ${TM2[z.type].color}, transparent 50%))` : t.fill,
                border: `0.5px solid ${z.active ? 'transparent' : t.border}`,
                color: z.active ? 'white' : t.label,
                minWidth: 96,
                boxShadow: z.active ? `0 6px 16px ${TM2[z.type].color}55` : 'none',
              }}>
                <div style={{ fontSize: 18, marginBottom: 4 }}>{TM2[z.type].symbol}</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{z.name}</div>
              </div>
            ))}
          </div>
        </div>

        {/* HT/NT Switch */}
        <div style={{ display: 'flex', gap: 6, padding: 4, borderRadius: 12, background: t.fill, marginBottom: 16 }}>
          {['HT', 'NT', 'Einsp. HT', 'Einsp. NT'].map((r, i) => (
            <button key={r} style={{
              flex: 1, padding: '8px 4px', borderRadius: 8,
              background: i === 0 ? t.surfaceSolid : 'transparent',
              border: 'none', fontSize: 12, fontWeight: 600,
              color: i === 0 ? t.label : t.tertiary,
              boxShadow: i === 0 ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}>{r}</button>
          ))}
        </div>

        {/* Zahleneingabe groß */}
        <div style={{
          background: t.surfaceSolid,
          border: `0.5px solid ${t.border}`,
          borderRadius: 18, padding: 18, marginBottom: 14,
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.03)',
        }}>
          <div style={{ fontSize: 11, color: t.tertiary, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 6 }}>
            Neuer Stand · kWh
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <div style={{ fontSize: 44, fontWeight: 700, fontFamily: 'ui-monospace, monospace', letterSpacing: '-0.04em', color: t.label, fontFeatureSettings: '"tnum"' }}>
              24.958
            </div>
            <div style={{ fontSize: 28, fontWeight: 600, color: t.tertiary }}>,</div>
            <div style={{ fontSize: 32, fontWeight: 600, color: A2.primary, fontFamily: 'ui-monospace, monospace' }}>2</div>
            <div style={{ width: 2, height: 32, background: A2.primary, marginLeft: 1, animation: 'blink 1s steps(2) infinite' }} />
          </div>
          <div style={{ fontSize: 12, color: t.tertiary, marginTop: 6 }}>
            Vorheriger Stand: <span style={{ fontFamily: 'ui-monospace, monospace', color: t.secondary, fontWeight: 600 }}>24.871,4 kWh</span> · Differenz: <span style={{ color: A2.green, fontWeight: 600 }}>+86,8 kWh</span>
          </div>
        </div>

        {/* Datum / Notiz */}
        <div style={{
          background: t.surfaceSolid,
          border: `0.5px solid ${t.border}`,
          borderRadius: 14, marginBottom: 14, overflow: 'hidden',
        }}>
          <div style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `0.5px solid ${t.separator}` }}>
            <div style={{ fontSize: 14, color: t.label }}>Datum & Zeit</div>
            <div style={{ fontSize: 14, color: A2.primary, fontFamily: 'ui-monospace, monospace', fontWeight: 600 }}>30.04.2026 · 18:42</div>
          </div>
          <div style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `0.5px solid ${t.separator}` }}>
            <div style={{ fontSize: 14, color: t.label }}>Foto anhängen</div>
            <div style={{ fontSize: 13, color: t.tertiary }}>›</div>
          </div>
          <div style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 14, color: t.label }}>Notiz</div>
            <div style={{ fontSize: 13, color: t.tertiary }}>optional ›</div>
          </div>
        </div>

        {/* Plausibilität */}
        <div style={{
          padding: '10px 14px', borderRadius: 12,
          background: `${A2.green}15`,
          border: `0.5px solid ${A2.green}30`,
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 12, color: A2.green, fontWeight: 600,
        }}>
          <span>✓</span> Plausibel · 12,4 kWh/Tag
        </div>
      </div>
    </window.GlowBg>
  );
}

// ───────────────────────── Erfassen B - Numpad first ─────────────────────────
function ErfassenB({ theme = 'light' }) {
  const t = T2[theme];
  return (
    <window.GlowBg theme={theme}>
      <window.StatusBar theme={theme} />
      <div style={{ padding: '8px 20px', height: 'calc(100% - 44px)', display: 'flex', flexDirection: 'column' }}>
        {/* Top bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <button style={{ width: 36, height: 36, borderRadius: '50%', background: t.fill, border: `0.5px solid ${t.border}`, color: t.label, fontSize: 18 }}>×</button>
          <div style={{ fontSize: 13, fontWeight: 600, color: t.tertiary, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Erfassen</div>
          <div style={{ width: 36 }} />
        </div>

        {/* Selected meter chip */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', borderRadius: 999,
          background: t.surface,
          border: `0.5px solid ${t.border}`,
          backdropFilter: 'blur(20px)',
          marginBottom: 16, alignSelf: 'center',
        }}>
          <window.TypeBadge type="electricity" theme={theme} size="sm" />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: t.label }}>Hauptzähler · HT Bezug</div>
          </div>
          <div style={{ color: t.tertiary, fontSize: 14 }}>›</div>
        </div>

        {/* Hero number */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: 11, color: t.tertiary, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, marginBottom: 4 }}>
            Neuer Stand
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <div style={{ fontSize: 68, fontWeight: 700, fontFamily: 'ui-monospace, "JetBrains Mono", monospace', letterSpacing: '-0.06em', color: t.label, fontFeatureSettings: '"tnum"', lineHeight: 1 }}>
              24.958
            </div>
            <div style={{ fontSize: 36, fontWeight: 600, color: A2.primary, fontFamily: 'ui-monospace, monospace' }}>,2</div>
            <div style={{ width: 3, height: 48, background: A2.primary, marginLeft: 2, alignSelf: 'flex-end', animation: 'blink 1s steps(2) infinite', borderRadius: 2 }} />
          </div>
          <div style={{ fontSize: 14, color: t.secondary, fontWeight: 500, marginTop: 4 }}>kWh</div>

          <div style={{
            marginTop: 16, padding: '8px 14px', borderRadius: 999,
            background: `${A2.green}18`,
            border: `0.5px solid ${A2.green}30`,
            fontSize: 12, color: A2.green, fontWeight: 600,
          }}>
            ✓ +86,8 kWh seit 23.04. · 12,4/Tag
          </div>
        </div>

        {/* Numpad */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
          {['1','2','3','4','5','6','7','8','9',',','0','⌫'].map(k => (
            <button key={k} style={{
              height: 56, borderRadius: 16,
              background: t.surface,
              backdropFilter: 'blur(20px)',
              border: `0.5px solid ${t.border}`,
              fontSize: 24, fontWeight: 500,
              color: t.label,
              fontFamily: 'ui-monospace, monospace',
              fontFeatureSettings: '"tnum"',
            }}>{k}</button>
          ))}
        </div>

        <button style={{
          width: '100%', padding: 16, borderRadius: 18,
          background: `linear-gradient(135deg, ${A2.primary}, ${A2.primaryDeep})`,
          color: 'white', fontSize: 16, fontWeight: 700,
          border: 'none', letterSpacing: '-0.01em',
          boxShadow: `0 8px 24px ${A2.primary}55`,
          marginBottom: 24,
        }}>Erfassung sichern</button>
      </div>
    </window.GlowBg>
  );
}

// ───────────────────────── Erfassungen Liste ─────────────────────────
function ListeA({ theme = 'light' }) {
  const t = T2[theme];
  const groups = [
    { day: 'Heute · 30. April 2026', items: M2.recentReadings.slice(0, 3) },
    { day: 'Gestern · 29. April 2026', items: M2.recentReadings.slice(3, 4) },
    { day: 'Montag · 28. April 2026', items: M2.recentReadings.slice(4, 5) },
    { day: 'vor 1 Woche · 23. April 2026', items: M2.recentReadings.slice(5, 7) },
  ];
  return (
    <window.GlowBg theme={theme}>
      <window.StatusBar theme={theme} />
      <div style={{ padding: '4px 20px 110px', overflowY: 'auto', height: 'calc(100% - 44px)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 13, color: t.tertiary, fontWeight: 500 }}>247 Erfassungen</div>
            <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.025em', color: t.label, lineHeight: 1.1 }}>Verlauf</div>
          </div>
          <button style={{ width: 36, height: 36, borderRadius: '50%', background: t.fill, border: `0.5px solid ${t.border}`, color: t.label, fontSize: 14 }}>↓</button>
        </div>

        {/* Search */}
        <div style={{
          background: t.fill, borderRadius: 12, padding: '10px 14px',
          fontSize: 14, color: t.tertiary, marginBottom: 14,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.5-4.5"/></svg>
          Suche · Zähler oder Notiz
        </div>

        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto' }}>
          <window.Pill theme={theme} active>Alle</window.Pill>
          <window.Pill theme={theme} tone={A2.electricity}>Strom</window.Pill>
          <window.Pill theme={theme} tone={A2.gas}>Gas</window.Pill>
          <window.Pill theme={theme} tone={A2.water}>Wasser</window.Pill>
          <window.Pill theme={theme} tone={A2.oil}>Heizöl</window.Pill>
        </div>

        {groups.map((g, gi) => (
          <div key={gi} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, color: t.tertiary, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 8, padding: '0 4px' }}>
              {g.day}
            </div>
            <window.GlassCard theme={theme} style={{ padding: 0, overflow: 'hidden' }}>
              {g.items.map((r, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px',
                  borderBottom: i < g.items.length - 1 ? `0.5px solid ${t.separator}` : 'none',
                }}>
                  <window.TypeBadge type={typeOf(r.mp)} theme={theme} size="sm" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: t.label, letterSpacing: '-0.01em' }}>{r.mp}</div>
                    <div style={{ fontSize: 11, color: t.tertiary, marginTop: 1 }}>{r.register} · {r.at.split(' ')[1]} · {r.user}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 15, fontWeight: 600, fontFamily: 'ui-monospace, monospace', color: t.label, fontFeatureSettings: '"tnum"' }}>
                      {window.fmt(r.value)}
                    </div>
                    <div style={{ fontSize: 10, color: t.tertiary }}>{r.unit}</div>
                  </div>
                </div>
              ))}
            </window.GlassCard>
          </div>
        ))}
      </div>
      <window.TabBar active="erfassungen" theme={theme} />
    </window.GlowBg>
  );
}

function typeOf(name) {
  if (name.includes('Strom')) return 'electricity';
  if (name.includes('Gas')) return 'gas';
  if (name.includes('Wasser')) return 'water';
  return 'oil';
}

// ───────────────────────── Liste B - Timeline ─────────────────────────
function ListeB({ theme = 'light' }) {
  const t = T2[theme];
  return (
    <window.GlowBg theme={theme}>
      <window.StatusBar theme={theme} />
      <div style={{ padding: '4px 20px 110px', overflowY: 'auto', height: 'calc(100% - 44px)' }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, color: t.tertiary, fontWeight: 500 }}>April 2026</div>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.025em', color: t.label, lineHeight: 1.1 }}>Erfassungen</div>
        </div>

        {/* Mini Calendar Heatmap */}
        <window.GlassCard theme={theme} style={{ padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: t.tertiary, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 10 }}>Aktivität · 30 Tage</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(15, 1fr)', gap: 4 }}>
            {Array.from({ length: 30 }, (_, i) => {
              const intensity = [0, 0, 1, 0, 2, 0, 0, 3, 0, 1, 0, 0, 2, 0, 1, 0, 0, 1, 2, 0, 0, 1, 0, 4, 1, 0, 2, 0, 1, 3][i];
              return (
                <div key={i} style={{
                  aspectRatio: '1',
                  borderRadius: 4,
                  background: intensity === 0 ? t.fill : `color-mix(in oklch, ${A2.primary} ${intensity * 25}%, transparent)`,
                  border: intensity > 0 ? `0.5px solid ${A2.primary}30` : 'none',
                }} />
              );
            })}
          </div>
        </window.GlassCard>

        {/* Timeline */}
        <div style={{ position: 'relative', paddingLeft: 28 }}>
          <div style={{ position: 'absolute', left: 13, top: 6, bottom: 6, width: 1.5, background: `linear-gradient(180deg, ${t.fillStrong}, ${t.fill})` }} />
          {M2.recentReadings.slice(0, 6).map((r, i) => (
            <div key={i} style={{ position: 'relative', marginBottom: 14 }}>
              <div style={{
                position: 'absolute', left: -22, top: 16,
                width: 12, height: 12, borderRadius: '50%',
                background: TM2[typeOf(r.mp)].color,
                boxShadow: `0 0 0 3px ${t.bg}, 0 0 12px ${TM2[typeOf(r.mp)].color}80`,
              }} />
              <window.GlassCard theme={theme} style={{ padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 11, color: t.tertiary, fontWeight: 500 }}>{r.at}</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: t.label, marginTop: 2 }}>{r.mp}</div>
                    <div style={{ fontSize: 12, color: t.tertiary, marginTop: 1 }}>{r.register} · von {r.user}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'ui-monospace, monospace', letterSpacing: '-0.02em', color: t.label, fontFeatureSettings: '"tnum"' }}>
                      {window.fmt(r.value)}
                    </div>
                    <div style={{ fontSize: 10, color: t.tertiary }}>{r.unit}</div>
                  </div>
                </div>
              </window.GlassCard>
            </div>
          ))}
        </div>
      </div>
      <window.TabBar active="erfassungen" theme={theme} />
    </window.GlowBg>
  );
}

// ───────────────────────── Login ─────────────────────────
function LoginA({ theme = 'light' }) {
  const t = T2[theme];
  return (
    <window.GlowBg theme={theme}>
      <window.StatusBar theme={theme} />
      <div style={{ padding: '40px 24px', height: 'calc(100% - 44px)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <div style={{
            width: 64, height: 64, borderRadius: 18,
            background: `linear-gradient(135deg, ${A2.primary}, ${A2.primaryDeep})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 12px 32px ${A2.primary}55, inset 0 1px 0 rgba(255,255,255,0.3)`,
            marginBottom: 24,
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9"/>
              <path d="M12 7v5l3 2"/>
            </svg>
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.025em', color: t.label, lineHeight: 1.1 }}>Zählerstand</div>
          <div style={{ fontSize: 16, color: t.tertiary, marginTop: 6 }}>Strom · Gas · Wasser · Heizöl</div>
        </div>

        <div>
          <window.GlassCard theme={theme} style={{ padding: 6, marginBottom: 14 }}>
            <div style={{ padding: '14px 16px', borderBottom: `0.5px solid ${t.separator}` }}>
              <div style={{ fontSize: 11, color: t.tertiary, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Benutzer</div>
              <div style={{ fontSize: 17, color: t.label, fontWeight: 500 }}>martin</div>
            </div>
            <div style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 11, color: t.tertiary, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Passwort</div>
              <div style={{ fontSize: 17, color: t.label, fontWeight: 500, fontFamily: 'ui-monospace, monospace', letterSpacing: '0.2em' }}>••••••••••••</div>
            </div>
          </window.GlassCard>

          <button style={{
            width: '100%', padding: 16, borderRadius: 18,
            background: `linear-gradient(135deg, ${A2.primary}, ${A2.primaryDeep})`,
            color: 'white', fontSize: 16, fontWeight: 700,
            border: 'none', letterSpacing: '-0.01em',
            boxShadow: `0 8px 24px ${A2.primary}55, inset 0 1px 0 rgba(255,255,255,0.2)`,
            marginBottom: 14,
          }}>Anmelden</button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', fontSize: 13, color: t.tertiary }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
            Self-hosted · keine Cloud
          </div>
        </div>
      </div>
    </window.GlowBg>
  );
}

function LoginB({ theme = 'light' }) {
  const t = T2[theme];
  return (
    <window.GlowBg theme={theme}>
      <window.StatusBar theme={theme} />
      <div style={{ padding: '0 0', height: 'calc(100% - 44px)', display: 'flex', flexDirection: 'column' }}>
        {/* Hero Visual: Tachometer */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
          <svg width="220" height="220" viewBox="0 0 220 220">
            <defs>
              <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={A2.primary}/>
                <stop offset="50%" stopColor={A2.electricity}/>
                <stop offset="100%" stopColor={A2.water}/>
              </linearGradient>
            </defs>
            <circle cx="110" cy="110" r="90" fill="none" stroke={t.fill} strokeWidth="14"/>
            <circle cx="110" cy="110" r="90" fill="none" stroke="url(#ring)" strokeWidth="14"
              strokeDasharray={`${0.72 * 2 * Math.PI * 90} ${2 * Math.PI * 90}`}
              strokeLinecap="round" transform="rotate(-90 110 110)"/>
            <text x="110" y="106" textAnchor="middle" fontSize="36" fontWeight="700" fill={t.label} fontFamily="ui-monospace, monospace" letterSpacing="-0.04em">2.840</text>
            <text x="110" y="128" textAnchor="middle" fontSize="14" fill={t.tertiary} fontWeight="500">Liter Heizöl</text>
            <text x="110" y="146" textAnchor="middle" fontSize="12" fill={A2.primary} fontWeight="600">71 % voll</text>
          </svg>
        </div>

        <div style={{ padding: '24px 24px 32px' }}>
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.025em', color: t.label, marginBottom: 4, lineHeight: 1.1 }}>Willkommen zurück</div>
          <div style={{ fontSize: 14, color: t.tertiary, marginBottom: 20 }}>Anmelden mit deinem Konto</div>

          <window.GlassCard theme={theme} style={{ padding: 0, marginBottom: 12 }}>
            <input style={{ width: '100%', padding: '14px 16px', background: 'transparent', border: 'none', borderBottom: `0.5px solid ${t.separator}`, fontSize: 15, color: t.label, outline: 'none' }} placeholder="Benutzername" defaultValue="martin"/>
            <input type="password" style={{ width: '100%', padding: '14px 16px', background: 'transparent', border: 'none', fontSize: 15, color: t.label, outline: 'none' }} placeholder="Passwort" defaultValue="••••••••"/>
          </window.GlassCard>

          <button style={{
            width: '100%', padding: 14, borderRadius: 16,
            background: `linear-gradient(135deg, ${A2.primary}, ${A2.primaryDeep})`,
            color: 'white', fontSize: 15, fontWeight: 700, border: 'none',
            boxShadow: `0 8px 20px ${A2.primary}55`,
          }}>Anmelden →</button>
        </div>
      </div>
    </window.GlowBg>
  );
}

// ───────────────────────── Mehr / Settings ─────────────────────────
function MehrA({ theme = 'light' }) {
  const t = T2[theme];
  const sections = [
    {
      title: 'Verwaltung',
      items: [
        { icon: 'M', label: 'Messstellen', sub: '4 aktiv', tone: A2.primary },
        { icon: 'L', label: 'Standorte', sub: '2 Standorte', tone: A2.electricity },
        { icon: 'U', label: 'Benutzer', sub: '3 aktiv · 1 admin', tone: A2.water },
        { icon: 'A', label: 'Audit-Log', sub: '247 Einträge', tone: A2.oil },
      ],
    },
    {
      title: 'Konto',
      items: [
        { icon: '🔒', label: 'Passwort ändern' },
        { icon: '↩', label: 'Auf allen Geräten abmelden' },
      ],
    },
    {
      title: 'App',
      items: [
        { icon: '🌙', label: 'Dunkles Design', toggle: true },
        { icon: 'i', label: 'Über', sub: 'v1.4.2 · self-hosted' },
      ],
    },
  ];
  return (
    <window.GlowBg theme={theme}>
      <window.StatusBar theme={theme} />
      <div style={{ padding: '4px 20px 110px', overflowY: 'auto', height: 'calc(100% - 44px)' }}>
        <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.025em', color: t.label, marginBottom: 16 }}>Mehr</div>

        {/* User-Card */}
        <window.GlassCard theme={theme} style={{ padding: 16, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%',
            background: `linear-gradient(135deg, ${A2.primary}, ${A2.primaryDeep})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontSize: 20, fontWeight: 700,
            boxShadow: `0 8px 20px ${A2.primary}55`,
          }}>M</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 600, color: t.label, letterSpacing: '-0.01em' }}>martin</div>
            <div style={{ fontSize: 12, color: t.tertiary, marginTop: 2 }}>Admin · letzte Anmeldung gestern</div>
          </div>
          <div style={{ padding: '4px 10px', borderRadius: 999, background: `${A2.primary}20`, color: A2.primaryDeep, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Admin</div>
        </window.GlassCard>

        {sections.map((sec, si) => (
          <div key={si} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, color: t.tertiary, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 8, padding: '0 4px' }}>
              {sec.title}
            </div>
            <window.GlassCard theme={theme} style={{ padding: 0, overflow: 'hidden' }}>
              {sec.items.map((it, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '13px 14px',
                  borderBottom: i < sec.items.length - 1 ? `0.5px solid ${t.separator}` : 'none',
                }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: 8,
                    background: it.tone ? `${it.tone}25` : t.fill,
                    color: it.tone || t.secondary,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 700,
                  }}>{it.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, color: t.label, fontWeight: 500 }}>{it.label}</div>
                    {it.sub && <div style={{ fontSize: 11, color: t.tertiary, marginTop: 1 }}>{it.sub}</div>}
                  </div>
                  {it.toggle ? (
                    <div style={{
                      width: 38, height: 22, borderRadius: 999,
                      background: theme === 'dark' ? A2.primary : t.fillStrong,
                      position: 'relative',
                    }}>
                      <div style={{
                        position: 'absolute', top: 2,
                        left: theme === 'dark' ? 18 : 2,
                        width: 18, height: 18, borderRadius: '50%',
                        background: 'white',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                        transition: 'left 0.2s',
                      }} />
                    </div>
                  ) : (
                    <div style={{ color: t.tertiary, fontSize: 16 }}>›</div>
                  )}
                </div>
              ))}
            </window.GlassCard>
          </div>
        ))}

        <button style={{
          width: '100%', padding: 14, borderRadius: 16,
          background: `${A2.red}15`,
          color: A2.red, fontSize: 15, fontWeight: 600, border: `0.5px solid ${A2.red}30`,
        }}>Abmelden</button>
      </div>
      <window.TabBar active="mehr" theme={theme} />
    </window.GlowBg>
  );
}

window.ErfassenA = ErfassenA;
window.ErfassenB = ErfassenB;
window.ListeA = ListeA;
window.ListeB = ListeB;
window.LoginA = LoginA;
window.LoginB = LoginB;
window.MehrA = MehrA;
