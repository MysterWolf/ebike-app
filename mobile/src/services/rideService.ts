import { RideSession, EndRidePayload, EndRideResponse } from '../types/ride';

const API_BASE_URL = 'http://10.0.2.2:3000/api'; // 10.0.2.2 maps to localhost on Android emulator

export async function startRideSession(): Promise<RideSession> {
  const res = await fetch(`${API_BASE_URL}/rides`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('Failed to start ride session');
  return res.json();
}

export async function endRideSession(
  id: string,
  payload: EndRidePayload
): Promise<EndRideResponse> {
  const res = await fetch(`${API_BASE_URL}/rides/${id}/end`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to end ride session');
  return res.json();
}

export async function getAllRides(): Promise<RideSession[]> {
  const res = await fetch(`${API_BASE_URL}/rides`);
  if (!res.ok) throw new Error('Failed to fetch rides');
  return res.json();
}

export async function getRideById(id: string): Promise<RideSession> {
  const res = await fetch(`${API_BASE_URL}/rides/${id}`);
  if (!res.ok) throw new Error('Ride not found');
  return res.json();
}
