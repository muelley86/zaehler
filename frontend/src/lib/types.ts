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
}

export interface OwnerAssignmentRead {
  id: number;
  owner_id: number | null;
  owner_name: string | null;
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
  kostenstelle: number | null;
  physical_meters: PhysicalMeterRead[];
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

export interface ConsumptionPoint {
  period_start: string;
  period_end: string;
  register_id: number;
  obis_code: string;
  consumption: string;
  unit: string;
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
  | 'all';

export interface ReportFilter {
  main_location_ids: (number | null)[];
  location_ids: (number | null)[];
  owner_ids: (number | null)[];
  kostenstellen: (number | null)[];
  meter_types: MeterType[];
}

export interface ReportRow {
  group_key: number | null;
  group_label: string;
  meter_type: MeterType;
  unit: string;
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
