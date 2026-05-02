export type MeterType = 'electricity' | 'gas' | 'water' | 'oil';
export type UserRole = 'admin' | 'recorder';

export interface Me {
  id: number;
  username: string;
  email: string | null;
  role: UserRole;
  is_active: boolean;
  force_password_change: boolean;
  last_login_at: string | null;
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
  delivery_date: string;
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

export interface LocationRead {
  id: number;
  name: string;
  note: string | null;
}

export interface MeasuringPointRead {
  id: number;
  name: string;
  type: MeterType;
  location_id: number | null;
  location_name: string | null;
  is_bidirectional: boolean;
  has_dual_tariff: boolean;
  tank_capacity: string | null;
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
