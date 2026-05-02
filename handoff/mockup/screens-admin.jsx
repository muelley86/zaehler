// Admin Screens — Messstellen, Standorte, Benutzer, Audit Log, Zähler-Detail
// Alle Desktop-Layouts mit Sidebar + Liquid Glass Stil

const TA = window.TOKENS;
const AA = window.ACCENTS;
const TMA = window.TYPE_META;

// Mock-Daten Erweiterung
const ADMIN_DATA = {
  measuringPoints: [
    { id: 1, name: 'Hauptzähler Strom', type: 'electricity', location: 'Keller', serial: 'EBZ-DD3-1907SR91', installed: '2019-03-12', registers: 3, has_dual_tariff: true, is_bidirectional: true, lastReading: '2026-04-30 18:42' },
    { id: 2, name: 'Wallbox Garage', type: 'electricity', location: 'Garage', serial: 'KEBA-P30-441288', installed: '2023-07-22', registers: 1, has_dual_tariff: false, is_bidirectional: false, lastReading: '2026-04-30 18:44' },
    { id: 3, name: 'Gaszähler', type: 'gas', location: 'Keller', serial: 'BK-G4-09422', installed: '2018-11-04', registers: 1, lastReading: '2026-04-30 18:45' },
    { id: 4, name: 'Wasseruhr Haus', type: 'water', location: 'Keller', serial: 'ZENNER-MNK-A-218',  installed: '2020-05-18', registers: 1, lastReading: '2026-04-29 09:12' },
    { id: 5, name: 'Wasseruhr Garten', type: 'water', location: 'Garten', serial: 'ZENNER-MNK-A-219', installed: '2021-04-10', registers: 1, lastReading: '2026-04-25 16:30' },
    { id: 6, name: 'Heizöltank', type: 'oil', location: 'Keller', serial: 'AFRISO-OEL-2840', installed: '2017-09-01', registers: 2, lastReading: '2026-04-28 14:00', tank_capacity: 4000 },
  ],
  locations: [
    { id: 1, name: 'Keller', note: 'Hauptraum unten, Tür hinter Heizung', mpCount: 4 },
    { id: 2, name: 'Garage', note: 'Wallbox links neben Eingangstür', mpCount: 1 },
    { id: 3, name: 'Garten', note: 'Außenuhr am Schuppen', mpCount: 1 },
    { id: 4, name: 'Dachboden', note: 'PV-Wechselrichter (zukünftig)', mpCount: 0 },
  ],
  users: [
    { id: 1, username: 'martin', email: 'martin@mueller.local', role: 'admin', is_active: true, last_login: '2026-04-30 18:40', readings: 124, force_pw_change: false },
    { id: 2, username: 'sabine', email: 'sabine@mueller.local', role: 'recorder', is_active: true, last_login: '2026-04-29 09:10', readings: 87, force_pw_change: false },
    { id: 3, username: 'jonas', email: null, role: 'recorder', is_active: true, last_login: '2026-04-22 17:30', readings: 18, force_pw_change: false },
    { id: 4, username: 'gast', email: null, role: 'recorder', is_active: false, last_login: '2025-12-08 14:22', readings: 4, force_pw_change: true },
  ],
  audit: [
    { id: 412, at: '2026-04-30 18:45:12', user: 'martin', action: 'create', entity: 'reading', entity_id: 8723, ip: '192.168.1.42', summary: 'Reading: Gaszähler · Gas · 8 234,156 m³' },
    { id: 411, at: '2026-04-30 18:42:08', user: 'martin', action: 'create', entity: 'reading', entity_id: 8722, ip: '192.168.1.42', summary: 'Reading: Hauptzähler Strom · NT Bezug · 18 234,7 kWh' },
    { id: 410, at: '2026-04-30 18:42:01', user: 'martin', action: 'create', entity: 'reading', entity_id: 8721, ip: '192.168.1.42', summary: 'Reading: Hauptzähler Strom · HT Bezug · 24 871,4 kWh' },
    { id: 409, at: '2026-04-30 18:40:00', user: 'martin', action: 'login', entity: 'session', entity_id: null, ip: '192.168.1.42', summary: 'Login erfolgreich' },
    { id: 408, at: '2026-04-29 09:12:44', user: 'sabine', action: 'create', entity: 'reading', entity_id: 8719, ip: '192.168.1.18', summary: 'Reading: Wasseruhr Haus · Wasser · 412,873 m³' },
    { id: 407, at: '2026-04-29 09:10:00', user: 'sabine', action: 'login', entity: 'session', entity_id: null, ip: '192.168.1.18', summary: 'Login erfolgreich' },
    { id: 406, at: '2026-04-28 14:01:18', user: 'martin', action: 'create', entity: 'delivery', entity_id: 42, ip: '192.168.1.42', summary: 'Heizöllieferung: 1 200 L · Heizöltank' },
    { id: 405, at: '2026-04-28 14:00:32', user: 'martin', action: 'create', entity: 'reading', entity_id: 8718, ip: '192.168.1.42', summary: 'Reading: Heizöltank · Tankstand · 2 840 L' },
    { id: 404, at: '2026-04-25 11:22:08', user: 'martin', action: 'update', entity: 'measuring_point', entity_id: 2, ip: '192.168.1.42', summary: 'Wallbox Garage: location → Garage' },
    { id: 403, at: '2026-04-22 17:32:11', user: 'jonas', action: 'create', entity: 'reading', entity_id: 8712, ip: '192.168.1.91', summary: 'Reading: Wasseruhr Garten · Wasser · 38,42 m³' },
    { id: 402, at: '2026-04-21 08:14:55', user: 'martin', action: 'meter_replaced', entity: 'physical_meter', entity_id: 12, ip: '192.168.1.42', summary: 'Zählertausch: Gaszähler · BK-G4-09421 → BK-G4-09422' },
    { id: 401, at: '2026-04-20 22:14:00', user: null, action: 'login_failed', entity: 'user', entity_id: 4, ip: '85.214.32.18', summary: 'Login fehlgeschlagen: gast (3. Versuch)' },
  ],
};

window.ADMIN_DATA = ADMIN_DATA;

// ───────────────── Admin Layout Wrapper ─────────────────
function AdminLayout({ active, theme = 'light', children, title, subtitle, action }) {
  const t = TA[theme];
  return (
    <div style={{ display: 'flex', height: '100%', background: t.bg, position: 'relative', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', top: -200, right: -100, width: 500, height: 500,
        borderRadius: '50%', background: `radial-gradient(circle, ${AA.primary}25, transparent 70%)`,
        filter: 'blur(80px)', pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: -250, left: 100, width: 500, height: 500,
        borderRadius: '50%', background: `radial-gradient(circle, ${AA.electricity}18, transparent 70%)`,
        filter: 'blur(80px)', pointerEvents: 'none',
      }} />

      <window.Sidebar theme={theme} active={active} />

      <main style={{ flex: 1, padding: '28px 40px', overflowY: 'auto', position: 'relative', minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 22 }}>
          <div>
            {subtitle && <div style={{ fontSize: 12, color: t.tertiary, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{subtitle}</div>}
            <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.025em', color: t.label, lineHeight: 1.05 }}>{title}</div>
          </div>
          {action}
        </div>
        {children}
      </main>
    </div>
  );
}

// ───────────────── Reusable Bits ─────────────────
function PrimaryButton({ children, theme = 'light', icon, onClick, variant = 'primary' }) {
  const t = TA[theme];
  if (variant === 'ghost') {
    return (
      <button onClick={onClick} style={{
        padding: '8px 14px', borderRadius: 10,
        background: t.fill, color: t.label,
        fontSize: 13, fontWeight: 600, border: `0.5px solid ${t.border}`,
        display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
      }}>{icon}{children}</button>
    );
  }
  return (
    <button onClick={onClick} style={{
      padding: '8px 14px', borderRadius: 10,
      background: `linear-gradient(135deg, ${AA.primary}, ${AA.primaryDeep})`,
      color: 'white', fontSize: 13, fontWeight: 600, border: 'none',
      boxShadow: `0 4px 12px ${AA.primary}55`,
      display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
    }}>{icon}{children}</button>
  );
}

function SearchField({ theme = 'light', placeholder = 'Suchen…', width = 240 }) {
  const t = TA[theme];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '7px 12px', borderRadius: 10,
      background: t.fill, border: `0.5px solid ${t.border}`,
      width,
    }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.tertiary} strokeWidth="2" strokeLinecap="round">
        <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>
      </svg>
      <input placeholder={placeholder} style={{
        flex: 1, border: 'none', outline: 'none', background: 'transparent',
        fontSize: 13, color: t.label, fontFamily: 'inherit',
      }} />
    </div>
  );
}

function StatusDot({ active, theme }) {
  return (
    <div style={{
      width: 8, height: 8, borderRadius: '50%',
      background: active ? AA.green : TA[theme].quaternary,
      boxShadow: active ? `0 0 0 3px ${AA.green}25` : 'none',
    }} />
  );
}

// ───────────────── Messstellen Liste ─────────────────
function AdminMeasuringPoints({ theme = 'light' }) {
  const t = TA[theme];
  const items = ADMIN_DATA.measuringPoints;

  return (
    <AdminLayout
      theme={theme}
      active="messstellen"
      subtitle="Administration"
      title="Messstellen"
      action={
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <SearchField theme={theme} placeholder="Name, Seriennummer…" />
          <PrimaryButton theme={theme} icon={<span style={{ fontSize: 16, lineHeight: 1 }}>+</span>}>Neue Messstelle</PrimaryButton>
        </div>
      }
    >
      {/* Filter Pills */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <window.Pill active theme={theme}>Alle · {items.length}</window.Pill>
        <window.Pill theme={theme}>Strom · 2</window.Pill>
        <window.Pill theme={theme}>Gas · 1</window.Pill>
        <window.Pill theme={theme}>Wasser · 2</window.Pill>
        <window.Pill theme={theme}>Heizöl · 1</window.Pill>
      </div>

      <window.GlassCard theme={theme} style={{ padding: 0, overflow: 'hidden' }}>
        {/* Header Row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '40px 1.6fr 1fr 1.4fr 0.8fr 1.1fr 32px',
          padding: '12px 18px', gap: 14,
          fontSize: 11, fontWeight: 600, color: t.tertiary,
          textTransform: 'uppercase', letterSpacing: '0.08em',
          borderBottom: `0.5px solid ${t.separator}`,
        }}>
          <div></div>
          <div>Name</div>
          <div>Standort</div>
          <div>Seriennummer</div>
          <div style={{ textAlign: 'right' }}>Register</div>
          <div>Letzte Erfassung</div>
          <div></div>
        </div>

        {items.map((mp, i) => (
          <div key={mp.id} style={{
            display: 'grid',
            gridTemplateColumns: '40px 1.6fr 1fr 1.4fr 0.8fr 1.1fr 32px',
            padding: '14px 18px', gap: 14,
            alignItems: 'center',
            borderBottom: i < items.length - 1 ? `0.5px solid ${t.separator}` : 'none',
            cursor: 'pointer',
          }}>
            <window.TypeBadge type={mp.type} theme={theme} size="sm" />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: t.label, letterSpacing: '-0.01em' }}>{mp.name}</div>
              <div style={{ fontSize: 11, color: t.tertiary, marginTop: 2, display: 'flex', gap: 6 }}>
                <span>{TMA[mp.type].label}</span>
                {mp.has_dual_tariff && <span>· HT/NT</span>}
                {mp.is_bidirectional && <span>· bidir.</span>}
                {mp.tank_capacity && <span>· {mp.tank_capacity.toLocaleString('de-DE')} L Tank</span>}
              </div>
            </div>
            <div style={{ fontSize: 13, color: t.secondary }}>{mp.location}</div>
            <div style={{ fontSize: 12, fontFamily: 'JetBrains Mono, ui-monospace, monospace', color: t.secondary }}>{mp.serial}</div>
            <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 600, color: t.label, fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>{mp.registers}</div>
            <div style={{ fontSize: 12, color: t.secondary, fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>{mp.lastReading}</div>
            <button style={{ background: 'none', border: 'none', color: t.tertiary, cursor: 'pointer', fontSize: 18, padding: 4 }}>›</button>
          </div>
        ))}
      </window.GlassCard>
    </AdminLayout>
  );
}

// ───────────────── Messstelle Detail ─────────────────
function AdminMeasuringPointDetail({ theme = 'light' }) {
  const t = TA[theme];
  const mp = ADMIN_DATA.measuringPoints[0]; // Hauptzähler Strom
  const consumption = window.MOCK_DATA.consumption.electricity.map(m => m.ht);

  const registers = [
    { obis: '1.8.1', label: 'HT Bezug', unit: 'kWh', current: 24871.4, last_at: '2026-04-30 18:42', readings: 387 },
    { obis: '1.8.2', label: 'NT Bezug', unit: 'kWh', current: 18234.7, last_at: '2026-04-30 18:42', readings: 387 },
    { obis: '2.8.1', label: 'HT Einspeisung', unit: 'kWh', current: 4127.3, last_at: '2026-04-30 18:42', readings: 312 },
  ];

  return (
    <AdminLayout
      theme={theme}
      active="messstellen"
      subtitle={<span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ color: AA.primary }}>← Messstellen</span></span>}
      title={mp.name}
      action={
        <div style={{ display: 'flex', gap: 10 }}>
          <PrimaryButton theme={theme} variant="ghost">Zähler tauschen</PrimaryButton>
          <PrimaryButton theme={theme} variant="ghost">Bearbeiten</PrimaryButton>
        </div>
      }
    >
      {/* Stamm + Aktiver Zähler */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14, marginBottom: 14 }}>
        <window.GlassCard theme={theme} style={{ padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 18 }}>
            <window.TypeBadge type={mp.type} theme={theme} size="lg" />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: t.tertiary, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Stammdaten</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: t.label, letterSpacing: '-0.02em', marginTop: 2 }}>{TMA[mp.type].label} · {mp.location}</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
            {[
              ['Typ', TMA[mp.type].label],
              ['Standort', mp.location],
              ['Doppeltarif (HT/NT)', mp.has_dual_tariff ? 'Ja' : 'Nein'],
              ['Bidirektional', mp.is_bidirectional ? 'Ja' : 'Nein'],
              ['Register aktiv', `${mp.registers}`],
              ['Angelegt', '2019-03-12'],
            ].map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: 11, color: t.tertiary, fontWeight: 500, marginBottom: 3 }}>{k}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: t.label }}>{v}</div>
              </div>
            ))}
          </div>
        </window.GlassCard>

        <window.GlassCard theme={theme} style={{ padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 12, color: t.tertiary, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Aktiver Zähler</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: t.label, marginTop: 2, letterSpacing: '-0.02em', fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>{mp.serial}</div>
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 999, background: `${AA.green}20`, color: AA.green }}>aktiv</div>
          </div>
          <div style={{ fontSize: 13, color: t.secondary, marginBottom: 18 }}>
            Eingebaut <strong style={{ color: t.label }}>{mp.installed}</strong> · seit <strong style={{ color: t.label }}>2 514 Tagen</strong>
          </div>
          <div style={{
            padding: 12, borderRadius: 10,
            background: t.fill, border: `0.5px dashed ${t.border}`,
            fontSize: 12, color: t.tertiary, lineHeight: 1.5,
          }}>
            Beim Zählertausch wird das aktuelle Gerät mit Datum „entfernt" markiert. Alle Erfassungen bleiben erhalten und werden weiterhin diesem Zähler zugeordnet.
          </div>
        </window.GlassCard>
      </div>

      {/* Verbrauchskurve */}
      <window.GlassCard theme={theme} style={{ padding: 22, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 12, color: t.tertiary, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Monatsverbrauch · 12 Monate</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: t.label, marginTop: 2, letterSpacing: '-0.02em' }}>4 162 kWh gesamt · Ø 347 kWh/Monat</div>
          </div>
          <div style={{ display: 'flex', gap: 14 }}>
            {[
              { label: 'HT Bezug', color: AA.electricity },
              { label: 'NT Bezug', color: AA.primaryDeep },
              { label: 'Einspeisung', color: AA.green },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: t.secondary }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: s.color }} />{s.label}
              </div>
            ))}
          </div>
        </div>
        <window.MultiAreaChart
          theme={theme}
          width={1100}
          height={220}
          months={window.MOCK_DATA.consumption.electricity.map(m => m.m)}
          series={[
            { name: 'ht', data: window.MOCK_DATA.consumption.electricity.map(m => m.ht), color: AA.electricity },
            { name: 'nt', data: window.MOCK_DATA.consumption.electricity.map(m => m.nt), color: AA.primaryDeep },
            { name: 'einsp', data: window.MOCK_DATA.consumption.electricity.map(m => m.einsp), color: AA.green },
          ]}
        />
      </window.GlassCard>

      {/* Register Liste */}
      <window.GlassCard theme={theme} style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: `0.5px solid ${t.separator}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.label, letterSpacing: '-0.01em' }}>Register</div>
            <div style={{ fontSize: 12, color: t.tertiary, marginTop: 2 }}>Pro OBIS-Code ein Wertverlauf</div>
          </div>
          <button style={{ fontSize: 12, color: AA.primary, background: 'none', border: 'none', fontWeight: 600, cursor: 'pointer' }}>+ Register hinzufügen</button>
        </div>
        {registers.map((r, i) => (
          <div key={r.obis} style={{
            display: 'grid', gridTemplateColumns: '0.6fr 1.4fr 1fr 1fr 1fr 32px',
            padding: '14px 18px', gap: 14, alignItems: 'center',
            borderBottom: i < registers.length - 1 ? `0.5px solid ${t.separator}` : 'none',
          }}>
            <div style={{ fontSize: 12, fontFamily: 'JetBrains Mono, ui-monospace, monospace', fontWeight: 600, color: AA.primary, padding: '3px 8px', borderRadius: 6, background: AA.primarySoft, width: 'fit-content' }}>{r.obis}</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: t.label }}>{r.label}</div>
            <div style={{ fontSize: 13, color: t.secondary }}>{r.readings} Erfassungen</div>
            <div style={{ fontSize: 13, fontFamily: 'JetBrains Mono, ui-monospace, monospace', color: t.label, fontWeight: 600 }}>
              {r.current.toLocaleString('de-DE')} <span style={{ color: t.tertiary, fontWeight: 500 }}>{r.unit}</span>
            </div>
            <div style={{ fontSize: 12, color: t.secondary, fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>{r.last_at}</div>
            <button style={{ background: 'none', border: 'none', color: t.tertiary, cursor: 'pointer', fontSize: 18 }}>›</button>
          </div>
        ))}
      </window.GlassCard>
    </AdminLayout>
  );
}

// ───────────────── Standorte ─────────────────
function AdminLocations({ theme = 'light' }) {
  const t = TA[theme];

  return (
    <AdminLayout
      theme={theme}
      active="standorte"
      subtitle="Administration"
      title="Standorte"
      action={
        <div style={{ display: 'flex', gap: 10 }}>
          <SearchField theme={theme} placeholder="Standort suchen…" />
          <PrimaryButton theme={theme} icon={<span style={{ fontSize: 16, lineHeight: 1 }}>+</span>}>Neuer Standort</PrimaryButton>
        </div>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
        {ADMIN_DATA.locations.map(loc => (
          <window.GlassCard key={loc.id} theme={theme} style={{ padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 14,
                  background: `linear-gradient(135deg, ${AA.primary}, ${AA.primaryDeep})`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: `0 4px 12px ${AA.primary}55, 0 1px 0 rgba(255,255,255,0.3) inset`,
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
                    <circle cx="12" cy="10" r="3"/>
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: t.label, letterSpacing: '-0.02em' }}>{loc.name}</div>
                  <div style={{ fontSize: 12, color: t.tertiary, marginTop: 2 }}>
                    {loc.mpCount === 0 ? 'Keine Messstellen' : `${loc.mpCount} ${loc.mpCount === 1 ? 'Messstelle' : 'Messstellen'}`}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button style={{ background: t.fill, border: `0.5px solid ${t.border}`, borderRadius: 8, padding: '5px 8px', fontSize: 11, color: t.secondary, fontWeight: 600, cursor: 'pointer' }}>Bearbeiten</button>
              </div>
            </div>
            <div style={{
              padding: 12, borderRadius: 10,
              background: t.fill, fontSize: 13, color: t.secondary, lineHeight: 1.5,
              borderLeft: `3px solid ${AA.primary}`,
            }}>
              {loc.note || <em style={{ color: t.tertiary }}>Keine Notiz</em>}
            </div>
          </window.GlassCard>
        ))}
      </div>
    </AdminLayout>
  );
}

// ───────────────── Benutzer ─────────────────
function AdminUsers({ theme = 'light' }) {
  const t = TA[theme];
  const users = ADMIN_DATA.users;

  return (
    <AdminLayout
      theme={theme}
      active="benutzer"
      subtitle="Administration"
      title="Benutzer"
      action={
        <div style={{ display: 'flex', gap: 10 }}>
          <SearchField theme={theme} placeholder="Benutzer suchen…" />
          <PrimaryButton theme={theme} icon={<span style={{ fontSize: 16, lineHeight: 1 }}>+</span>}>Neuer Benutzer</PrimaryButton>
        </div>
      }
    >
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <window.Pill active theme={theme}>Alle · {users.length}</window.Pill>
        <window.Pill theme={theme}>Admins · 1</window.Pill>
        <window.Pill theme={theme}>Erfasser · 3</window.Pill>
        <window.Pill theme={theme}>Inaktiv · 1</window.Pill>
      </div>

      <window.GlassCard theme={theme} style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '40px 1.4fr 1.6fr 1fr 1fr 1.1fr 0.8fr 32px',
          padding: '12px 18px', gap: 14,
          fontSize: 11, fontWeight: 600, color: t.tertiary,
          textTransform: 'uppercase', letterSpacing: '0.08em',
          borderBottom: `0.5px solid ${t.separator}`,
        }}>
          <div></div>
          <div>Benutzer</div>
          <div>E-Mail</div>
          <div>Rolle</div>
          <div>Status</div>
          <div>Letzter Login</div>
          <div style={{ textAlign: 'right' }}>Erfassungen</div>
          <div></div>
        </div>

        {users.map((u, i) => (
          <div key={u.id} style={{
            display: 'grid',
            gridTemplateColumns: '40px 1.4fr 1.6fr 1fr 1fr 1.1fr 0.8fr 32px',
            padding: '14px 18px', gap: 14, alignItems: 'center',
            borderBottom: i < users.length - 1 ? `0.5px solid ${t.separator}` : 'none',
            opacity: u.is_active ? 1 : 0.6,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: u.role === 'admin'
                ? `linear-gradient(135deg, ${AA.primary}, ${AA.primaryDeep})`
                : `linear-gradient(135deg, ${AA.electricity}, ${AA.gas})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontSize: 13, fontWeight: 700,
            }}>{u.username[0].toUpperCase()}</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: t.label, letterSpacing: '-0.01em' }}>{u.username}</div>
              {u.force_pw_change && (
                <div style={{ fontSize: 10, color: AA.red, marginTop: 2, fontWeight: 600 }}>Passwortwechsel erforderlich</div>
              )}
            </div>
            <div style={{ fontSize: 13, color: u.email ? t.secondary : t.quaternary, fontStyle: u.email ? 'normal' : 'italic' }}>
              {u.email || '—'}
            </div>
            <div>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                background: u.role === 'admin' ? `${AA.primary}20` : t.fill,
                color: u.role === 'admin' ? AA.primaryDeep : t.secondary,
                textTransform: 'uppercase', letterSpacing: '0.04em',
              }}>{u.role}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <StatusDot active={u.is_active} theme={theme} />
              <span style={{ fontSize: 13, color: t.secondary }}>{u.is_active ? 'Aktiv' : 'Inaktiv'}</span>
            </div>
            <div style={{ fontSize: 12, color: t.secondary, fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>{u.last_login}</div>
            <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 600, color: t.label, fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>{u.readings}</div>
            <button style={{ background: 'none', border: 'none', color: t.tertiary, cursor: 'pointer', fontSize: 18 }}>⋯</button>
          </div>
        ))}
      </window.GlassCard>
    </AdminLayout>
  );
}

// ───────────────── Audit Log ─────────────────
const ACTION_META = {
  create: { label: 'Erstellt', color: AA.green, icon: '+' },
  update: { label: 'Aktualisiert', color: AA.electricity, icon: '↻' },
  delete: { label: 'Gelöscht', color: AA.red, icon: '−' },
  login: { label: 'Login', color: AA.water, icon: '→' },
  login_failed: { label: 'Login fehlgeschlagen', color: AA.red, icon: '✕' },
  logout: { label: 'Logout', color: 'currentColor', icon: '←' },
  password_reset: { label: 'Passwort zurückgesetzt', color: AA.electricity, icon: '⟲' },
  meter_replaced: { label: 'Zählertausch', color: AA.primary, icon: '⇄' },
};

function AdminAudit({ theme = 'light' }) {
  const t = TA[theme];
  const items = ADMIN_DATA.audit;

  // Group by date
  const groups = {};
  items.forEach(it => {
    const date = it.at.split(' ')[0];
    if (!groups[date]) groups[date] = [];
    groups[date].push(it);
  });

  const fmtDate = (iso) => {
    const [y, m, d] = iso.split('-');
    const dt = new Date(+y, +m - 1, +d);
    const today = new Date(2026, 3, 30);
    const diff = Math.floor((today - dt) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'Heute · ' + dt.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
    if (diff === 1) return 'Gestern · ' + dt.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
    return dt.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  return (
    <AdminLayout
      theme={theme}
      active="audit"
      subtitle="Administration"
      title="Audit Log"
      action={
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <SearchField theme={theme} placeholder="Benutzer, Aktion, Entität…" width={280} />
          <PrimaryButton theme={theme} variant="ghost" icon={
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
          }>Export CSV</PrimaryButton>
        </div>
      }
    >
      {/* Filter row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <window.Pill active theme={theme}>Alle Aktionen</window.Pill>
        <window.Pill theme={theme}>Nur Schreibvorgänge</window.Pill>
        <window.Pill theme={theme}>Logins</window.Pill>
        <window.Pill theme={theme}>Fehlgeschlagen</window.Pill>
        <div style={{ width: 1, background: t.separator, margin: '0 4px' }} />
        <window.Pill theme={theme}>Alle Benutzer ▾</window.Pill>
        <window.Pill theme={theme}>Alle Entitäten ▾</window.Pill>
        <window.Pill theme={theme}>Letzte 30 Tage ▾</window.Pill>
      </div>

      {Object.entries(groups).map(([date, entries]) => (
        <div key={date} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: t.tertiary, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, padding: '0 4px' }}>
            {fmtDate(date)} · <span style={{ color: t.quaternary, fontWeight: 500 }}>{entries.length} Einträge</span>
          </div>
          <window.GlassCard theme={theme} style={{ padding: 0, overflow: 'hidden' }}>
            {entries.map((e, i) => {
              const meta = ACTION_META[e.action] || { label: e.action, color: t.tertiary, icon: '•' };
              return (
                <div key={e.id} style={{
                  display: 'grid',
                  gridTemplateColumns: '90px 28px 1fr 130px 120px 110px',
                  padding: '12px 18px', gap: 14, alignItems: 'center',
                  borderBottom: i < entries.length - 1 ? `0.5px solid ${t.separator}` : 'none',
                }}>
                  <div style={{ fontSize: 12, fontFamily: 'JetBrains Mono, ui-monospace, monospace', color: t.tertiary }}>
                    {e.at.split(' ')[1]}
                  </div>
                  <div style={{
                    width: 24, height: 24, borderRadius: 7,
                    background: `${meta.color}20`, color: meta.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700,
                  }}>{meta.icon}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, color: t.label, fontWeight: 500, letterSpacing: '-0.005em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {e.summary}
                    </div>
                    <div style={{ fontSize: 11, color: t.tertiary, marginTop: 2 }}>
                      {meta.label} · {e.entity}{e.entity_id ? ` #${e.entity_id}` : ''}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: e.user ? t.secondary : t.quaternary, fontStyle: e.user ? 'normal' : 'italic' }}>
                    {e.user || 'system'}
                  </div>
                  <div style={{ fontSize: 12, fontFamily: 'JetBrains Mono, ui-monospace, monospace', color: t.tertiary }}>
                    {e.ip}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <button style={{ fontSize: 12, color: AA.primary, background: 'none', border: 'none', fontWeight: 600, cursor: 'pointer' }}>Diff ansehen</button>
                  </div>
                </div>
              );
            })}
          </window.GlassCard>
        </div>
      ))}
    </AdminLayout>
  );
}

Object.assign(window, {
  AdminMeasuringPoints,
  AdminMeasuringPointDetail,
  AdminLocations,
  AdminUsers,
  AdminAudit,
});
