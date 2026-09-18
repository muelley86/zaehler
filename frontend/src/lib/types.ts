export type MeterType = 'electricity' | 'water' | 'heating';
export type HeatingSource = 'oil' | 'gas' | 'wood_chips' | 'wood' | 'district_heat';
export type HeatingUnit = 'kWh' | 'MWh' | 'SRM' | 'CBM' | 'To' | 'h' | 'L' | 'm³';
export const HEATING_UNITS: readonly HeatingUnit[] = [
  'kWh',
  'MWh',
  'SRM',
  'CBM',
  'To',
  'h',
  'L',
  'm³',
];
export type UserRole = 'admin' | 'recorder';

export interface Me {
  id: number;
  username: string;
  email: string | null;
  role: UserRole;
  is_active: boolean;
  force_password_change: boolean;
  totp_enabled: boolean;
  can_assign_qr_tokens: boolean;
  /** Darf das Abrechnungsmodul bedienen (Admins immer). */
  can_billing: boolean;
  last_login_at: string | null;
  // Vom Backend berechnet: Admin ohne 2FA bei aktivem METERS_REQUIRE_TOTP_FOR_ADMIN.
  // Optional, weil nur die /auth/me-Antwort es führt (nicht die Admin-User-Liste).
  must_setup_totp?: boolean;
}

export interface LoginResponse {
  requires_2fa: boolean;
  me: Me | null;
  challenge_token: string | null;
}

export interface TotpSetupResponse {
  secret: string;
  provisioning_uri: string;
  qr_png_base64: string;
}

export interface TotpStatusResponse {
  enabled: boolean;
  backup_codes_remaining: number;
}

export interface BackupCodesResponse {
  backup_codes: string[];
}

export interface UserRead extends Me {
  created_at: string;
}

export interface RegisterRead {
  id: number;
  obis_code: string;
  label: string;
  unit: string;
  is_active: boolean;
  max_value: string;
  accepts_deliveries: boolean;
}

export interface DeliveryRead {
  id: number;
  register_id: number;
  delivery_at: string;
  amount: string;
  note: string | null;
  created_at: string;
  created_by_user_id: number | null;
  created_by_username: string | null;
}

export interface RegisterStateRead {
  register_id: number;
  physical_meter_id: number;
  obis_code: string;
  label: string;
  unit: string;
  is_active: boolean;
  accepts_deliveries: boolean;
  last_reading_at: string | null;
  last_reading_value: string | null;
  refilled_since: string;
  current_value: string | null;
}

export interface PhysicalMeterRead {
  id: number;
  serial_number: string;
  installed_at: string;
  removed_at: string | null;
  /** Wandlerfaktor des Geräts (nur Strom); ``null`` = kein Wandler. */
  transformer_factor: number | null;
  registers: RegisterRead[];
}

export type SearchMatchKind =
  | 'serial'
  | 'contract_number'
  | 'market_location'
  | 'owner'
  | 'installation_location'
  | 'name'
  | 'main_location'
  | 'location'
  | 'location_address'
  | 'owner_note'
  | 'main_location_note'
  | 'location_note';

export interface SearchHit {
  measuring_point_id: number;
  measuring_point_name: string;
  location_id: number | null;
  location_name: string | null;
  main_location_id: number | null;
  main_location_name: string | null;
  matched_via: SearchMatchKind;
  matched_detail: string | null;
}

export interface OwnerRead {
  id: number;
  name: string;
  address_street: string | null;
  address_postcode: string | null;
  address_city: string | null;
  email: string | null;
  phone: string | null;
  vat_id: string | null;
  tax_id: string | null;
  note: string | null;
  /** Interne Umlage: keine Rechnung, Stromabrechnung per KOST-Stapel. */
  internal_allocation: boolean;
}

export type BillingPositionKind = 'meter' | 'rest';

export interface BillingCircleRead {
  id: number;
  code: string;
  name: string;
  rechnungsleger: string;
  abnahmestelle: string;
  marktlokation: string | null;
  note: string | null;
}

export interface BillingPositionRead {
  id: number;
  circle_id: number;
  sort_order: number;
  label: string;
  kind: BillingPositionKind;
  measuring_point_id: number | null;
  measuring_point_name: string | null;
  parent_position_id: number | null;
  owner_id: number | null;
  owner_name: string | null;
  kostenstelle: number | null;
  invoice_line: string | null;
  note: string | null;
  valid_from: string;
  valid_to: string | null;
}

export interface BillingCheckRow {
  position_id: number;
  label: string;
  kind: BillingPositionKind;
  measuring_point_id: number | null;
  measuring_point_name: string | null;
  parent_position_id: number | null;
  owner_id: number | null;
  owner_name: string | null;
  internal_allocation: boolean;
  kostenstelle: number | null;
  mieter_name: string | null;
  invoice_line: string | null;
}

export interface BillingFinding {
  position_id: number | null;
  label: string;
  code: string;
  message: string;
}

export type BillingImportLevel = 'aktion' | 'hinweis' | 'fehler';

export interface BillingImportEntry {
  level: BillingImportLevel;
  circle: string;
  label: string | null;
  message: string;
}

export interface BillingImportReport {
  applied: boolean;
  valid_from: string;
  entries: BillingImportEntry[];
  counts: Record<BillingImportLevel, number>;
}

export type BillingStandArt = 'abgelesen' | 'interpoliert' | 'nur_davor' | 'nur_danach';

export interface BillingStandRead {
  wert: string;
  art: BillingStandArt;
  ablesung_vor: string | null;
  ablesung_nach: string | null;
  abstand_tage: number;
}

export interface BillingReadingRow {
  position_id: number;
  label: string;
  kind: BillingPositionKind;
  measuring_point_id: number | null;
  measuring_point_name: string | null;
  serial_numbers: string;
  transformer_factor: number | null;
  stand_alt: BillingStandRead | null;
  stand_neu: BillingStandRead | null;
  korrektur_kwh: string | null;
  korrektur_note: string | null;
  kwh: string | null;
}

export interface BillingReadingsRead {
  monat: string;
  stichtag_alt: string;
  stichtag_neu: string;
  max_abstand_tage: number;
  positions: BillingReadingRow[];
  findings: BillingFinding[];
}

export interface BillingAttachmentHead {
  circle_code: string;
  circle_name: string;
  rechnungsleger: string;
  abnahmestelle: string;
  marktlokation: string | null;
  monat: string;
  monatsname: string;
  version: number;
  status: BillingRunStatus;
  rechnung_nummer: string;
  rechnung_datum: string;
  zeitraum_von: string;
  zeitraum_bis: string;
}

export interface BillingAttachmentSummary {
  einkaufspreis_ct: string;
  umlagepreis_ct: string;
  preis_ct: string;
  preis_eur: string;
  bezugsmenge: string;
  zaehlersumme: string;
  gesamtkosten: string;
  gesamt_eur: string;
  umsatzsteuer: string;
}

export interface BillingAttachmentLine {
  label: string;
  kostenstelle: number | null;
  serial_numbers: string;
  transformer_factor: number | null;
  stand_alt: string | null;
  stand_alt_art: string | null;
  stand_neu: string | null;
  stand_neu_art: string | null;
  korrektur_kwh: string | null;
  kwh: string | null;
  eur: string | null;
  invoice_line: string | null;
}

export interface BillingAttachmentKst {
  kst: string | null;
  kwh: string;
  eur: string;
}

export interface BillingAttachmentSection {
  name: string;
  positionen: { name: string; betrag: string; ct: string }[];
  summe: string;
  ct: string;
}

export interface BillingAttachmentRecipient {
  owner_name: string;
  internal_allocation: boolean;
  lines: BillingAttachmentLine[];
  kostenstellen: BillingAttachmentKst[];
  abschnitte: BillingAttachmentSection[];
  kwh: string;
  eur: string;
  gesamt_ct: string;
}

export interface BillingAttachmentRead {
  head: BillingAttachmentHead;
  summary: BillingAttachmentSummary;
  empfaenger: BillingAttachmentRecipient[];
}

/** Versionsvergleich zweier Abrechnungsläufe desselben Monats. */
export type BillingDiffStatus = 'gleich' | 'geaendert' | 'neu' | 'entfallen';

export interface BillingRunDiffLine {
  label: string;
  status: BillingDiffStatus;
  felder: string[];
  kwh_alt: string | null;
  kwh_neu: string | null;
  eur_alt: string | null;
  eur_neu: string | null;
  kwh_delta: string | null;
  eur_delta: string | null;
}

export interface BillingRunDiffSide {
  run_id: number;
  version: number;
  status: BillingRunStatus;
  begruendung: string | null;
  finalized_at: string | null;
  preis_eur: string | null;
  gesamt_eur: string | null;
  saldo_eur: string | null;
}

export interface BillingRunDiff {
  monat: string;
  alt: BillingRunDiffSide;
  neu: BillingRunDiffSide;
  zeilen: BillingRunDiffLine[];
  kwh_delta: string;
  eur_delta: string;
}

export interface BillingHistoryPoint {
  monat: string;
  version: number;
  kwh: string;
  eur: string;
}

export interface BillingHistoryRow {
  name: string;
  internal_allocation: boolean;
  punkte: BillingHistoryPoint[];
}

export interface BillingHistory {
  monate: string[];
  empfaenger: BillingHistoryRow[];
  positionen: BillingHistoryRow[];
}

/** Monatsübersicht: Fortschritt eines Kreises in einem Monat. */
export type BillingMonthStatus =
  | 'leer'
  | 'rechnung'
  | 'entwurf'
  | 'festgeschrieben'
  | 'uebertragen';

export interface BillingMonthCell {
  monat: string;
  status: BillingMonthStatus;
  invoice: boolean;
  run_id: number | null;
  version: number | null;
  eur: string | null;
  empfaenger: number;
  uebertragen: number;
  blocking: number;
}

export interface BillingMonthRow {
  circle_id: number;
  code: string;
  name: string;
  monate: BillingMonthCell[];
}

export interface BillingMonthOverview {
  von: string;
  bis: string;
  monate: string[];
  kreise: BillingMonthRow[];
}

export interface BillingTransferRow {
  datum: string;
  menge: string;
  beschreibung: string;
  preis_eur: string;
  umsatzsteuer: string;
  betrag: string;
  betrag_lauf: string;
  positionen: string[];
}

export interface BillingTransferState {
  id: number;
  belegnummer: string | null;
  note: string | null;
  transferred_at: string;
  transferred_by: number | null;
}

export interface BillingTransferRecipient {
  owner_name: string;
  internal_allocation: boolean;
  rows: BillingTransferRow[];
  netto: string;
  brutto: string;
  netto_lauf: string;
  differenz: string;
  transfer: BillingTransferState | null;
}

export interface BillingTransferView {
  run_id: number;
  monat: string;
  monatsname: string;
  stichtag: string;
  kopfsatz: string;
  preis_eur: string;
  umsatzsteuer: string;
  empfaenger: BillingTransferRecipient[];
}

export interface UnassignedMeterRead {
  id: number;
  name: string;
  serial_numbers: string;
}

export type BillingRunStatus = 'entwurf' | 'festgeschrieben' | 'ersetzt';

export interface BillingRunFinding {
  position_id: number | null;
  label: string;
  code: string;
  message: string;
  blocking: boolean;
}

export interface BillingRunLineRead {
  id: number;
  sort_order: number;
  position_id: number | null;
  label: string;
  kind: BillingPositionKind;
  parent_label: string | null;
  owner_id: number | null;
  owner_name: string | null;
  internal_allocation: boolean;
  kostenstelle: number | null;
  mieter_name: string | null;
  invoice_line: string | null;
  measuring_point_id: number | null;
  measuring_point_name: string | null;
  serial_numbers: string;
  transformer_factor: number | null;
  stand_alt: string | null;
  stand_alt_art: BillingStandArt | null;
  stand_alt_abstand: number | null;
  stand_neu: string | null;
  stand_neu_art: BillingStandArt | null;
  stand_neu_abstand: number | null;
  korrektur_kwh: string | null;
  korrektur_note: string | null;
  manual_stand_alt: string | null;
  manual_stand_neu: string | null;
  manual_korrektur_kwh: string | null;
  manual_note: string | null;
  kwh: string | null;
  eur: string | null;
  pruefung: string | null;
}

export interface BillingRunGroupResult {
  name: string;
  intern: boolean;
  kwh: string;
  eur: string;
  kostenstellen: { kst: string | null; kwh: string; eur: string }[];
}

export interface BillingRunResult {
  preis_ct: string;
  preis_eur: string;
  einkaufspreis_ct: string;
  umlagepreis_ct: string;
  bezugsmenge: string;
  gesamtkosten: string;
  zaehlersumme: string;
  nicht_gemessen_kwh: string | null;
  gesamt_eur: string;
  saldo_eur: string;
  saldo_grenze_eur: string;
  gruppen: BillingRunGroupResult[];
}

export interface BillingRunSummary {
  id: number;
  circle_id: number;
  monat: string;
  version: number;
  status: BillingRunStatus;
  invoice_id: number;
  begruendung: string | null;
  created_at: string;
  created_by: number | null;
  finalized_at: string | null;
  finalized_by: number | null;
  preis_eur: string | null;
  gesamt_eur: string | null;
  saldo_eur: string | null;
  blocking_count: number;
}

export interface BillingRunRead extends BillingRunSummary {
  zusatzkosten: string;
  aufschlag_prozent: string;
  aufschlag_ct: string;
  result: BillingRunResult | null;
  befunde: BillingRunFinding[];
  lines: BillingRunLineRead[];
}

export interface BillingInvoicePositionRead {
  id: number;
  sort_order: number;
  name: string;
  abschnitt: string;
  zeitraum: string;
  menge: string | null;
  preis_ct: string | null;
  betrag: string;
  kategorie: string | null;
}

export interface BillingInvoiceRead {
  id: number;
  circle_id: number;
  nummer: string;
  datum: string;
  aid: string;
  marktlokation: string;
  period_from: string;
  period_to: string;
  period_month: string; // JJJJ-MM, vom Server aus dem Zeitraum abgeleitet
  verbrauch_kwh: string;
  leistungsspitze_kw: string;
  betrag_netto: string;
  hinweise: string[];
  pdf_sha256: string;
  pdf_size: number;
  pdf_filename: string;
  uploaded_by: number | null;
  created_at: string;
  positions: BillingInvoicePositionRead[];
}

export interface BillingCheckRead {
  stichtag: string;
  positions: BillingCheckRow[];
  findings: BillingFinding[];
}

export interface OwnerAssignmentRead {
  id: number;
  owner_id: number | null;
  owner_name: string | null;
  valid_from: string;
  valid_to: string | null;
}

/** Mieter — natürliche Person (Vorname optional, Nachname Pflicht), ohne Steuer-IDs.
 *  `display_name` ist „Nachname, Vorname" (vom Backend abgeleitet). */
export interface MieterRead {
  id: number;
  first_name: string | null;
  last_name: string;
  display_name: string;
  address_street: string | null;
  address_postcode: string | null;
  address_city: string | null;
  email: string | null;
  phone: string | null;
  note: string | null;
}

/** Kostenstelle mit Gültigkeitszeitraum (halboffen: ``valid_to`` gehört nicht mehr dazu). */
export interface KostenstelleAssignmentRead {
  id: number;
  kostenstelle: number;
  valid_from: string;
  valid_to: string | null;
}

export interface MieterAssignmentRead {
  id: number;
  mieter_id: number | null;
  mieter_name: string | null;
  valid_from: string;
  valid_to: string | null;
}

/** Lieferant — identischer Feldsatz wie OwnerRead (gespiegeltes Backend-Schema). */
export interface SupplierRead {
  id: number;
  name: string;
  address_street: string | null;
  address_postcode: string | null;
  address_city: string | null;
  email: string | null;
  phone: string | null;
  vat_id: string | null;
  tax_id: string | null;
  note: string | null;
}

export interface SupplierAssignmentRead {
  id: number;
  /** null, wenn der Lieferant nach Anlage der Periode gelöscht wurde (SET NULL). */
  supplier_id: number | null;
  supplier_name: string | null;
  valid_from: string;
  valid_to: string | null;
}

export interface MainLocationRead {
  id: number;
  name: string;
  note: string | null;
}

export interface LocationRead {
  id: number;
  name: string;
  note: string | null;
  latitude: number | null;
  longitude: number | null;
  address_street: string | null;
  address_postcode: string | null;
  address_city: string | null;
  main_location_id: number | null;
  main_location_name: string | null;
}

export interface MeasuringPointRead {
  id: number;
  name: string;
  type: MeterType;
  location_id: number | null;
  location_name: string | null;
  main_location_id: number | null;
  main_location_name: string | null;
  is_bidirectional: boolean;
  has_dual_tariff: boolean;
  tank_capacity: string | null;
  transformer_factor: number | null;
  heating_source: HeatingSource | null;
  contract_number: string | null;
  market_location: string | null;
  installation_location: string | null;
  current_owner_id: number | null;
  current_owner_name: string | null;
  current_supplier_id: number | null;
  current_supplier_name: string | null;
  current_mieter_id: number | null;
  current_mieter_name: string | null;
  kostenstelle: number | null;
  physical_meters: PhysicalMeterRead[];
}

// Eine Messstelle gebündelt mit ihrem aktuellen Register-Stand — Datenquelle
// der Stammdaten-Detailseiten (Eigentümer/Lieferant/Mieter).
export interface MeasuringPointWithStateRead {
  measuring_point: MeasuringPointRead;
  registers: RegisterStateRead[];
}

export interface ReadingRead {
  id: number;
  register_id: number;
  value: string;
  reading_at: string;
  note: string | null;
  created_at: string;
  created_by_user_id: number | null;
  created_by_username: string | null;
  has_photo: boolean;
  photos: ReadingPhotoRead[];
}

export interface ReadingPhotoRead {
  id: number;
  photo_lat: number | null;
  photo_lon: number | null;
}

export interface BulkDeleteResult {
  deleted: number;
  skipped: { id: number; reason: string }[];
}

export interface EntryRead {
  kind: 'reading' | 'correction' | 'delivery';
  reading: ReadingRead | null;
  delivery: DeliveryRead | null;
  previous_value: string | null;
}

export interface EntriesPage {
  items: EntryRead[];
  total: number;
}

export interface ConsumptionPoint {
  period_start: string;
  period_end: string;
  register_id: number;
  obis_code: string;
  consumption: string;
  unit: string;
}

/** Register-Stammdaten einer Messstelle im Dashboard-Kontext. */
export interface DashboardRegister {
  obis_code: string;
  label: string;
  unit: string;
}

/** Summe (aktuell/vorherige Periode) je (Zählerart, Einheit, Richtung)-Bucket. */
export interface DashboardTotal {
  obis_code: string; // bei virtuellen Items 'virtual'
  unit: string;
  direction: FlowDirection;
  current: string | null; // Decimal-String; null = kein Intervall deckt den Zeitraum
  previous: string | null;
}

// Gebündelter Dashboard-Endpoint: Stammdaten + Verbrauch + Summen je Messstelle
// in einer Antwort (statt mehrerer Requests pro MP).
export interface DashboardMeasuringPoint {
  id: number;
  name: string;
  type: MeterType;
  heating_source: HeatingSource | null;
  main_location_id: number | null;
  main_location_name: string | null;
  location_id: number | null;
  location_name: string | null;
  current_owner_id: number | null;
  current_owner_name: string | null;
  kostenstelle: number | null;
  installation_location: string | null;
  registers: DashboardRegister[];
  last_reading_at: string | null; // ISO-DateTime
  consumption: ConsumptionPoint[];
  totals: DashboardTotal[];
}

/**
 * Verrechnete Messstelle im Dashboard: Netto-Reihe, kann negative Buckets
 * enthalten. Standort/Hauptstandort wie bei echten Messstellen (Filter),
 * Eigentümer/Kostenstelle gibt es bei abgeleiteten Werten nicht.
 */
export interface DashboardVirtualMeasuringPoint {
  id: number;
  name: string;
  type: MeterType;
  location_id: number | null;
  location_name: string | null;
  main_location_id: number | null;
  main_location_name: string | null;
  consumption: ConsumptionPoint[];
  totals: DashboardTotal[];
}

export type DashboardGranularity = 'day' | 'week' | 'month' | 'year';

export interface DashboardResponse {
  items: DashboardMeasuringPoint[];
  /** Optional — ältere Backend-Stände liefern das Feld nicht; Hook normalisiert `?? []`. */
  virtual_items?: DashboardVirtualMeasuringPoint[];
  from_date: string | null;
  to_date: string | null;
  previous_from_date: string | null;
  previous_to_date: string | null;
  granularity: DashboardGranularity | null;
  partial: boolean;
}

// Virtuelle (verrechnete) Messstellen: +/− Kombination echter Messstellen.
export type FlowDirection = 'bezug' | 'einspeisung';

export interface VirtualMpComponentRead {
  id: number;
  measuring_point_id: number;
  measuring_point_name: string;
  direction: FlowDirection;
  sign: number; // +1 | -1
}

export interface VirtualMeasuringPointRead {
  id: number;
  name: string;
  note: string | null;
  type: MeterType;
  location_id: number | null;
  location_name: string | null;
  /** Abgeleitet über den Standort — nicht direkt gesetzt. */
  main_location_id: number | null;
  main_location_name: string | null;
  components: VirtualMpComponentRead[];
}

/**
 * Breakdown (Audit-Aufschlüsselung) einer verrechneten Messstelle:
 * `consumption` ist der Rohwert (>= 0), `contribution` = sign * consumption —
 * was tatsächlich in die Netto-Summe einging.
 */
export interface VirtualMpBreakdownComponent {
  component_id: number;
  measuring_point_id: number;
  measuring_point_name: string;
  direction: FlowDirection;
  sign: number; // +1 | -1
  consumption: string;
  contribution: string;
  unit: string;
}

export interface VirtualMpBreakdownTotal {
  unit: string;
  net: string; // kann negativ sein
}

export interface VirtualMpBreakdownResponse {
  virtual_measuring_point_id: number;
  from_date: string | null;
  to_date: string | null;
  components: VirtualMpBreakdownComponent[];
  totals: VirtualMpBreakdownTotal[];
}

export interface AuditLogRead {
  id: number;
  user_id: number | null;
  action: string;
  entity_type: string;
  entity_id: number | null;
  diff: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export interface ProblemDetails {
  type?: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  [key: string]: unknown;
}

// Per-Recorder MP-Zugriff (Feature B)
export interface UserAccessRead {
  user_id: number;
  measuring_point_ids: number[];
}

export interface UserAccessUpdate {
  measuring_point_ids: number[];
}

export interface MpAccessUserRead {
  user_id: number;
  username: string;
  role: UserRole;
  source: 'admin' | 'grant';
}

// QR-Token-Verheiratung (Feature A)
export interface QrTokenRead {
  id: number;
  token: string;
  measuring_point_id: number | null;
  measuring_point_name: string | null;
  created_at: string;
  created_by_user_id: number;
  assigned_at: string | null;
  assigned_by_user_id: number | null;
}

export interface QrTokenResolveResponse {
  measuring_point_id: number | null;
  can_assign: boolean;
}

// --- Auswertungen (Reports) -------------------------------------------------

export type ReportDimension =
  | 'kostenstelle'
  | 'owner'
  | 'location'
  | 'main_location'
  | 'meter_type'
  | 'measuring_point';
export type ReportGranularity = 'day' | 'week' | 'month' | 'year' | 'total';
export type ReportPeriodKind =
  | 'fixed'
  | 'current_year'
  | 'last_12_months'
  | 'current_month'
  | 'last_month'
  | 'all'
  | 'shared_range';

export interface ReportFilter {
  main_location_ids: (number | null)[];
  location_ids: (number | null)[];
  owner_ids: (number | null)[];
  kostenstellen: (number | null)[];
  meter_types: MeterType[];
  /** Explizite Messstellen-Auswahl (nur echte MPs); fehlt in Alt-Configs. */
  measuring_point_ids?: number[];
}

export interface ReportRow {
  group_key: number | null;
  group_label: string;
  meter_type: MeterType;
  unit: string;
  /** Einspeise-Register (OBIS 2.8.x) bilden eigene Zeilen — nie mit Bezug summiert. */
  direction: 'bezug' | 'einspeisung';
  /** Verrechnete (virtuelle) Messstelle — eigener Key-Namensraum für group_key. */
  is_virtual?: boolean;
  period_start: string | null;
  period_end: string | null;
  consumption: string;
}

export interface ReportAggregateResponse {
  dimension: ReportDimension;
  granularity: ReportGranularity;
  from_date: string | null;
  to_date: string | null;
  partial: boolean;
  rows: ReportRow[];
}

export interface ReportConfigRead {
  id: number;
  name: string;
  dimension: ReportDimension;
  granularity: ReportGranularity;
  period_kind: ReportPeriodKind;
  from_date: string | null;
  to_date: string | null;
  filters: ReportFilter;
  created_at: string;
}

// --- Zählerstand-Import (Excel/CSV) ---------------------------------------

export interface ImportCell {
  reading_date: string;
  raw: string;
  value: string | null;
  error: string | null;
}

export interface ImportRow {
  index: number;
  raw_name: string;
  matched_mp_id: number | null;
  cells: ImportCell[];
}

export interface ImportPreviewResponse {
  reading_dates: string[];
  rows: ImportRow[];
  ignored_columns: string[];
}

export interface ImportCommitFailure {
  register_id: number;
  reading_date: string;
  reason: string;
}

export interface ImportCommitResponse {
  created: number;
  skipped_existing: number;
  failed: ImportCommitFailure[];
}

// --- Voll-Backup (ZIP) & Restore -------------------------------------------

export interface BackupManifest {
  format: number;
  app_version: string | null;
  alembic_revision: string | null;
  created_at: string;
  photo_count: number;
  db_sha256: string | null;
}

export interface RestoreCounts {
  users: number;
  measuring_points: number;
  readings: number;
  photos_in_db: number;
  photos_in_zip: number;
}

export type RestoreCompatibility = 'ok' | 'migration_needed' | 'unknown_revision';

export interface RestorePreviewResponse {
  token: string;
  expires_at: string;
  manifest: BackupManifest | null;
  db_alembic_revision: string | null;
  counts: RestoreCounts;
  compatibility: RestoreCompatibility;
  backup_age_days: number | null;
  warnings: string[];
}

export interface RestoreCommitResponse {
  migrations_applied: boolean;
  monthly_cache_recomputed: boolean;
  relogin_required: boolean;
  restored: RestoreCounts;
  message: string;
}
