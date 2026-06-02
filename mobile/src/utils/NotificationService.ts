import { NativeModules, PermissionsAndroid, Platform } from 'react-native';

const { NotificationModule } = NativeModules;

export function schedulePreflightNotification(hour: number, minute: number): void {
  if (Platform.OS === 'android') NotificationModule?.schedulePreflightNotification(hour, minute);
}

export function cancelPreflightNotification(): void {
  if (Platform.OS === 'android') NotificationModule?.cancelPreflightNotification();
}

export async function isPreflightScheduled(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  return (await NotificationModule?.isScheduled()) ?? false;
}

export async function getLaunchTab(): Promise<string | null> {
  if (Platform.OS !== 'android') return null;
  return (await NotificationModule?.getLaunchTab()) ?? null;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if (Number(Platform.Version) < 33) return true;
  const result = await PermissionsAndroid.request(
    'android.permission.POST_NOTIFICATIONS' as any
  );
  return result === PermissionsAndroid.RESULTS.GRANTED;
}
