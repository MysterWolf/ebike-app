export interface ChargeLogEntry {
  pct: number;
  time: string;
}

export interface RideLogEntry {
  distance: number;
  batteryUsed: number | null;
  drawRate: number | null;
  date: string;
  logged_at?: string;
  rideMode?: string;
  notes?: string;
}

export type ModCategory =
  | 'Tires'
  | 'Brakes'
  | 'Lighting'
  | 'Motor'
  | 'Battery'
  | 'Handlebars'
  | 'Seat'
  | 'Other';

export interface ModLogEntry {
  id: string;
  category: ModCategory;
  component: string;
  notes: string;
  date: string;
}

export interface TirePressureEntry {
  front: number;
  rear: number;
  date: string;
}

export interface ServiceLogEntry {
  date: string;
  notes: string;
  odometer: number;
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  time: string;
}

export type GearCategory = 'footwear' | 'helmet' | 'gloves' | 'jacket' | 'cargo' | 'lock';

export interface PreflightSchedule {
  id: string;
  hour: number;   // 0-23
  minute: number; // 0-59
}

export interface ChargeCalibrationPoint {
  time:      string;  // ISO — when this actual reading was taken
  estimated: number;  // model's % at that moment, just before correction
  actual:    number;  // user-entered real %
}

export interface ChargeSession {
  isCharging:     boolean;
  startTime:      string | null;  // ISO
  startPct:       number | null;
  lastActualPct:  number | null;
  lastActualTime: string | null;  // ISO — anchor for estimation once set
  calibration:    ChargeCalibrationPoint[];  // this session only
}

export const DEFAULT_CHARGE_SESSION: ChargeSession = {
  isCharging:     false,
  startTime:      null,
  startPct:       null,
  lastActualPct:  null,
  lastActualTime: null,
  calibration:    [],
};

export interface AppState {
  odometer: number;
  battery: number;
  rideMode: 'MAX_RANGE' | 'CRUISER' | 'SPORT' | 'CUSTOM';
  rideLog: RideLogEntry[];
  chargerAmps: number;
  chargeTarget: number;
  chargeLog: ChargeLogEntry[];
  customGearOptions: Partial<Record<GearCategory, string[]>>;
  checklistState: Record<string, boolean>;
  tirePressureLog: TirePressureEntry[];
  serviceLog: ServiceLogEntry[];
  modLog: ModLogEntry[];
  tireSizeFromMod: boolean;
  make: string;
  model: string;
  nickname: string;
  year: number;
  voltage: number;
  capacityAh: number;
  motorWatts: number;
  weightLbs: number;
  tireSize: string;
  topSpeed: number;
  footwear: string;
  footwearCustom: string;
  helmet: string;
  gloves: string;
  jacket: string;
  cargo: string;
  lock: string;
  rigDeviceName: string;
  rigMountType: string;
  rigPrimaryUse: string;
  rigOnline: boolean;
  apiKey: string;
  messages: Message[];
  preflightNotifEnabled:   boolean;
  preflightNotifHour:      number;   // legacy — kept for migration only
  preflightNotifMinute:    number;   // legacy — kept for migration only
  hasAskedNotifPermission: boolean;
  preflightSchedules:      PreflightSchedule[];
  chargeSession:           ChargeSession;
}

export const DEFAULT_STATE: AppState = {
  odometer: 0,
  battery: 100,
  rideMode: 'CRUISER',
  rideLog: [],
  chargerAmps: 2,
  chargeTarget: 95,
  chargeLog: [],
  customGearOptions: {},
  checklistState: {},
  tirePressureLog: [],
  serviceLog: [],
  modLog: [],
  tireSizeFromMod: false,
  make: 'Movcan',
  model: 'V70',
  nickname: '',
  year: 2024,
  voltage: 52,
  capacityAh: 20,
  motorWatts: 750,
  weightLbs: 73,
  tireSize: '26 x 4.0 fat',
  topSpeed: 28,
  footwear: 'Adidas Sambas',
  footwearCustom: '',
  helmet: 'Half shell',
  gloves: 'Summer/fingerless',
  jacket: 'None/casual',
  cargo: 'None',
  lock: 'U-lock',
  rigDeviceName: '',
  rigMountType: '',
  rigPrimaryUse: '',
  rigOnline: false,
  apiKey: '',
  messages: [],
  preflightNotifEnabled:   true,
  preflightNotifHour:      6,
  preflightNotifMinute:    30,
  hasAskedNotifPermission: false,
  preflightSchedules:      [],
  chargeSession:           DEFAULT_CHARGE_SESSION,
};

export type Tab = 'ride' | 'bike' | 'gear' | 'ops' | 'chat';
