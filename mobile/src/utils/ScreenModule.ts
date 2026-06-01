import { NativeModules, Platform } from 'react-native';

const { ScreenModule } = NativeModules;

export function activateKeepAwake(): void {
  if (Platform.OS === 'android') ScreenModule?.activateKeepAwake();
}

export function deactivateKeepAwake(): void {
  if (Platform.OS === 'android') ScreenModule?.deactivateKeepAwake();
}

// ratioWidth / ratioHeight — the aspect ratio of the PiP window.
// 16:9 = landscape strip (default); 2:1 = narrow portrait strip.
export function enterPip(ratioWidth = 16, ratioHeight = 9): void {
  if (Platform.OS === 'android') ScreenModule?.enterPip(ratioWidth, ratioHeight);
}

export function exitPip(): void {
  if (Platform.OS === 'android') ScreenModule?.exitPip();
}
