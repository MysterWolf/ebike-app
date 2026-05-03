export interface RideSession {
  id: string;
  startTime: string;
  endTime: string | null;
  duration: number;      // seconds
  distance: number;      // miles
  averageSpeed: number;  // mph
  topSpeed: number;      // mph
  status: 'active' | 'completed';
}

export interface EndRidePayload {
  distance: number;
  averageSpeed: number;
  topSpeed: number;
}

export interface EndRideResponse {
  session: RideSession;
  warning?: string;
}
