import { Share } from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import RNFS from 'react-native-fs';
import { AppState, DEFAULT_STATE, RideLogEntry } from '../state/types';
import { initDb, dbAll } from '../db/database';

export async function exportData(state: AppState): Promise<void> {
  const json = JSON.stringify(state, null, 2);
  await Share.share({ message: json });
}

export async function exportRidesCsv(state: AppState): Promise<void> {
  await initDb();

  type RideRow = {
    id: string; date_str: string | null; logged_at: string | null;
    distance_mi: number | null; battery_used_pct: number | null;
    wh_used: number | null; draw_rate: number | null;
    ride_mode: string | null; odometer_after: number | null; notes: string | null;
  };

  const rows = await dbAll<RideRow>(
    `SELECT id, date_str, logged_at, distance_mi, battery_used_pct,
            wh_used, draw_rate, ride_mode, odometer_after, notes
     FROM ride_log ORDER BY logged_at ASC`
  );

  const MI_TO_KM = 1.60934;
  const header = [
    'ride_id', 'date', 'distance_km', 'battery_used_pct', 'wh_used',
    'draw_rate', 'ride_mode', 'odometer_after_km', 'notes',
    'avg_motor_watts', 'max_motor_watts', 'avg_battery_v', 'start_battery_v', 'end_battery_v',
  ].join(',');

  const csvRows = rows.map(r => {
    const distKm = r.distance_mi != null ? (r.distance_mi * MI_TO_KM).toFixed(2) : '';
    const odomKm = r.odometer_after != null ? (r.odometer_after * MI_TO_KM).toFixed(2) : '';
    const note   = r.notes ? `"${r.notes.replace(/"/g, '""')}"` : '';
    return [
      r.id,
      r.date_str ?? r.logged_at?.slice(0, 10) ?? '',
      distKm,
      r.battery_used_pct?.toFixed(1) ?? '',
      r.wh_used?.toFixed(0) ?? '',
      r.draw_rate?.toFixed(2) ?? '',
      r.ride_mode ?? '',
      odomKm,
      note,
      '', '', '', '', '',  // telemetry columns — Phase 2
    ].join(',');
  });

  const csv = [header, ...csvRows].join('\n');
  const filename = `ebike-rides-${new Date().toISOString().slice(0, 10)}.csv`;
  const path = `${RNFS.CachesDirectoryPath}/${filename}`;
  await RNFS.writeFile(path, csv, 'utf8');
  await Share.share({ title: filename, message: csv });
}

export async function importRidesCsv(): Promise<RideLogEntry[]> {
  const result = await DocumentPicker.pickSingle({
    type: [DocumentPicker.types.plainText, DocumentPicker.types.csv ?? 'text/csv'],
    copyTo: 'cachesDirectory',
  });

  const localUri = result.fileCopyUri ?? result.uri;
  const path = localUri.replace(/^file:\/\//, '');
  const text = await RNFS.readFile(path, 'utf8');

  const lines = text.trim().split('\n');
  if (lines.length < 2) throw new Error('CSV has no data rows.');

  const KM_TO_MI = 1 / 1.60934;
  const entries: RideLogEntry[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const distKm  = parseFloat(cols[2]);
    const batUsed = parseFloat(cols[3]);
    const drawRaw = parseFloat(cols[5]);
    const date    = cols[1]?.trim();
    const mode    = cols[6]?.trim() || undefined;

    if (isNaN(distKm) || isNaN(batUsed) || !date) continue;

    const distMi  = distKm * KM_TO_MI;
    const drawRate = isNaN(drawRaw) ? batUsed / distMi : drawRaw;

    entries.push({
      distance:   parseFloat(distMi.toFixed(2)),
      batteryUsed: batUsed,
      drawRate:   parseFloat(drawRate.toFixed(2)),
      date,
      rideMode:   mode,
    });
  }

  if (entries.length === 0) throw new Error('No valid rides found in CSV.');
  return entries;
}

export async function importData(): Promise<AppState | null> {
  const result = await DocumentPicker.pickSingle({
    type: [DocumentPicker.types.json, DocumentPicker.types.plainText],
    copyTo: 'cachesDirectory',
  });

  const localUri = result.fileCopyUri ?? result.uri;
  const path = localUri.replace(/^file:\/\//, '');
  const text = await RNFS.readFile(path, 'utf8');

  const parsed: unknown = JSON.parse(text);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed) ||
    typeof (parsed as Record<string, unknown>).odometer !== 'number' ||
    !Array.isArray((parsed as Record<string, unknown>).rideLog)
  ) {
    throw new Error('File does not appear to be an E-Bike app backup.');
  }

  return { ...DEFAULT_STATE, ...(parsed as Partial<AppState>) } as AppState;
}
