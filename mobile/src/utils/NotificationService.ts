import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import { PreflightSchedule } from '../state/types';

const { NotificationModule } = NativeModules;

export async function schedulePreflightNotifications(schedules: PreflightSchedule[]): Promise<void> {
  if (Platform.OS !== 'android') return;
  // Cancel all existing slots first
  await NotificationModule?.cancelAllPreflightNotifications();
  // Schedule each slot (max 3)
  schedules.slice(0, 3).forEach((s, index) => {
    NotificationModule?.schedulePreflightNotification(index, s.hour, s.minute);
  });
}

export async function cancelAllPreflightNotifications(): Promise<void> {
  if (Platform.OS === 'android') await NotificationModule?.cancelAllPreflightNotifications();
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
