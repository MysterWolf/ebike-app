import { Share } from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import RNFS from 'react-native-fs';
import { AppState, DEFAULT_STATE } from '../state/types';

export async function exportData(state: AppState): Promise<void> {
  const json = JSON.stringify(state, null, 2);
  await Share.share({ message: json });
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
