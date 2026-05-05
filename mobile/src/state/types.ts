export interface ChargeLogEntry {
  pct: number;
  time: string;
}

export interface RideLogEntry {
  distance: number;
  batteryUsed: number;
  drawRate: number;
  date: string;
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

export interface AppState {
  odometer: number;
  battery: number;
  rideMode: 'MAX_RANGE' | 'CRUISER' | 'HARD';
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
};

export type Tab = 'ride' | 'bike' | 'gear' | 'ops' | 'chat';
