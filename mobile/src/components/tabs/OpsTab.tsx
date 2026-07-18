import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Switch,
  Modal,
  StyleSheet,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import DeviceInfo from 'react-native-device-info';
import DocumentPicker from 'react-native-document-picker';
import { exportData, exportRidesCsv, importRidesCsv, importData } from '../../utils/dataExport';
import { CollapsibleSection } from '../CollapsibleSection';
import { useTheme } from '../../theme/ThemeContext';
import { ThemeMode } from '../../theme/ThemeContext';
import { MONO } from '../../theme/colors';
import {
  AppState,
  DEFAULT_STATE,
  TirePressureEntry,
  ServiceLogEntry,
  ModLogEntry,
  ModCategory,
  ChargeLogEntry,
  ChargeCalibrationPoint,
  DEFAULT_CHARGE_SESSION,
} from '../../state/types';
import { OPS_PROMPTS } from '../../utils/ai';
import { schedulePreflightNotifications, cancelAllPreflightNotifications } from '../../utils/NotificationService';
import { PreflightSchedule } from '../../state/types';
import { nextService } from '../../utils/calculations';
import { currentChargeEstimate, elapsedLabel } from '../../utils/chargeEstimate';
import { useBleContext } from '../../context/BleContext';

interface Props {
  state: AppState;
  update: (u: Partial<AppState>) => void;
  onMissionAction: (text: string) => void;
  onReset: () => void;
  onEditProfile: () => void;
}

interface ChecklistItem {
  key: string;
  label: string;
  sublabel: string;
}

const MOD_CATEGORIES: ModCategory[] = [
  'Tires', 'Brakes', 'Lighting', 'Motor', 'Battery', 'Handlebars', 'Seat', 'Other',
];

const MOUNT_TYPES   = ['Handlebar Mount', 'Stem Mount', 'Frame Mount', 'Other'];
const PRIMARY_USES  = ['Recording', 'Navigation', 'Music', 'All of the above'];

function formatDate(): string {
  const now = new Date();
  return (
    now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ', ' +
    now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  );
}

function buildGearItems(state: AppState): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  if (state.helmet !== 'None')         items.push({ key: 'gear-helmet', label: 'Helmet on',     sublabel: state.helmet });
  if (state.gloves !== 'None')         items.push({ key: 'gear-gloves', label: 'Gloves ready',  sublabel: state.gloves });
  if (state.jacket !== 'None/casual')  items.push({ key: 'gear-jacket', label: 'Jacket on',     sublabel: state.jacket });
  if (state.cargo !== 'None')          items.push({ key: 'gear-cargo',  label: 'Cargo secured', sublabel: state.cargo  });
  if (state.lock !== 'None')           items.push({ key: 'gear-lock',   label: 'Lock packed',   sublabel: state.lock   });
  if (state.rigOnline && state.rigDeviceName)
    items.push({ key: 'gear-rig', label: 'Media rig', sublabel: `${state.rigDeviceName} · Mounted` });
  return items;
}

export function OpsTab({ state, update, onMissionAction, onReset, onEditProfile }: Props) {
  const { C, mode, resolvedMode, setMode } = useTheme();
  const [dataLoading, setDataLoading] = useState<'export' | 'csv' | 'importCsv' | 'import' | null>(null);
  const [frontPsiInput, setFrontPsiInput] = useState('');
  const [rearPsiInput, setRearPsiInput] = useState('');
  const [psiError, setPsiError] = useState(false);
  const [serviceNotes, setServiceNotes] = useState('');

  const [modModalVisible, setModModalVisible] = useState(false);
  const [modCategory, setModCategory] = useState<ModCategory>('Tires');
  const [modComponent, setModComponent] = useState('');
  const [modNotes, setModNotes] = useState('');
  const [modComponentError, setModComponentError] = useState(false);

  // Time picker modal for preflight scheduling
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [pickerHour, setPickerHour] = useState(6);
  const [pickerMinute, setPickerMinute] = useState(0);
  const [pickerAmPm, setPickerAmPm] = useState<'AM' | 'PM'>('AM');

  // Charging timer
  const { lastKnownBlePct } = useBleContext();
  const [chargeTick, setChargeTick] = useState(0); // forces elapsed/estimate refresh; not the source of truth
  const [startPctInput, setStartPctInput] = useState('');
  const [actualInputMode, setActualInputMode] = useState<'update' | 'done' | null>(null);
  const [actualPctInput, setActualPctInput] = useState('');
  const [actualPctError, setActualPctError] = useState(false);

  const chargeSession = state.chargeSession ?? DEFAULT_CHARGE_SESSION;

  useEffect(() => {
    if (!chargeSession.isCharging) return;
    const t = setInterval(() => setChargeTick(n => n + 1), 60000);
    return () => clearInterval(t);
  }, [chargeSession.isCharging]);

  function startCharging() {
    const pct = parseFloat(startPctInput);
    const startPct = !isNaN(pct) && pct >= 0 && pct <= 100 ? pct : (lastKnownBlePct ?? state.battery);
    update({
      chargeSession: {
        isCharging: true,
        startTime: new Date().toISOString(),
        startPct,
        lastActualPct: null,
        lastActualTime: null,
        calibration: [],
      },
    });
    setStartPctInput('');
  }

  function openActualInput(mode: 'update' | 'done') {
    setActualInputMode(mode);
    setActualPctInput('');
    setActualPctError(false);
  }

  function confirmActualInput() {
    const pct = parseFloat(actualPctInput);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      setActualPctError(true);
      setTimeout(() => setActualPctError(false), 1400);
      return;
    }
    const now = new Date();
    const estimated = currentChargeEstimate(chargeSession, now).pct;
    const point: ChargeCalibrationPoint = { time: now.toISOString(), estimated, actual: pct };

    if (actualInputMode === 'done') {
      const entry: ChargeLogEntry = {
        pct: Math.round(pct),
        time: now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
          now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      };
      update({
        chargeSession: DEFAULT_CHARGE_SESSION,
        chargeLog: [...state.chargeLog, entry],
        battery: Math.round(pct),
      });
    } else {
      update({
        chargeSession: {
          ...chargeSession,
          lastActualPct: pct,
          lastActualTime: now.toISOString(),
          calibration: [...chargeSession.calibration, point],
        },
      });
    }
    setActualInputMode(null);
    setActualPctInput('');
  }

  const chargeEstimate = currentChargeEstimate(chargeSession);

  const MOD_COLORS = useMemo(() => ({
    Tires:      { bg: 'rgba(196,136,58,0.15)', text: C.warning  },
    Brakes:     { bg: C.dangerTint,            text: C.danger   },
    Lighting:   { bg: 'rgba(255,204,0,0.10)',  text: '#9a7000'  },
    Motor:      { bg: C.accentTint,            text: C.accent   },
    Battery:    { bg: C.accentTint,            text: C.accent   },
    Handlebars: { bg: C.surface,               text: C.inkMid   },
    Seat:       { bg: C.surface,               text: C.inkMid   },
    Other:      { bg: C.surface,               text: C.inkMid   },
  } as Record<ModCategory, { bg: string; text: string }>), [C]);

  const styles = useMemo(() => StyleSheet.create({
    scroll:   { flex: 1, backgroundColor: C.background },
    content:  { padding: 12 },

    // Display mode toggle
    modeToggleRow: { flexDirection: 'row', gap: 8 },
    modePill: {
      flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 6,
      paddingVertical: 10, alignItems: 'center', backgroundColor: C.white,
    },
    modePillActive:   { backgroundColor: C.accent, borderColor: C.accent },
    modePillText:     { fontFamily: MONO, fontSize: 11, fontWeight: '700', color: C.inkMid, letterSpacing: 1.5 },
    modePillTextActive: { color: '#FFFFFF' },
    modePillSub:      { fontFamily: MONO, fontSize: 8, color: C.muted, marginTop: 2 },
    modeActiveSub:    { color: 'rgba(255,255,255,0.75)' },

    resetBtn:  { fontFamily: MONO, fontSize: 8, letterSpacing: 1.5, color: C.inkMid, textDecorationLine: 'underline' },
    divider:   { height: 1, backgroundColor: C.border, marginVertical: 12 },

    toggleStatus:   { fontFamily: MONO, fontSize: 9, color: C.muted },
    toggleStatusOn: { color: C.accent },

    rigCard: { backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 6, overflow: 'hidden' },
    rigField: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
    rigFieldLabel: { fontFamily: MONO, fontSize: 8, letterSpacing: 1.5, color: C.inkMid, textTransform: 'uppercase', marginBottom: 8 },
    rigInput: {
      backgroundColor: C.background, borderWidth: 1, borderColor: C.border, borderRadius: 6,
      paddingHorizontal: 10, paddingVertical: 8, fontFamily: MONO, fontSize: 12, color: C.ink,
    },
    chipRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip:     { borderWidth: 1, borderColor: C.border, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: C.background },
    chipActive: { backgroundColor: C.accentTint, borderColor: C.accentTint },
    chipText:   { fontFamily: MONO, fontSize: 10, color: C.inkMid },
    chipTextActive: { color: C.accent, fontWeight: '700' },
    rigToggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },

    progressRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    progressTrack: { flex: 1, height: 4, backgroundColor: C.border, borderRadius: 2, overflow: 'hidden' },
    progressFill:  { height: 4, backgroundColor: C.accent, borderRadius: 2 },
    progressLabel: { fontFamily: MONO, fontSize: 10, color: C.inkMid, minWidth: 28, textAlign: 'right' },

    card: { backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 4 },
    checkRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.border, gap: 10 },
    checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    checkboxChecked: { backgroundColor: C.accent, borderColor: C.accent },
    checkmark:  { fontSize: 12, color: '#FFFFFF', fontWeight: '700', lineHeight: 14 },
    checkContent: { flex: 1 },
    checkLabel:   { fontFamily: MONO, fontSize: 11, color: C.ink, fontWeight: '600' },
    checkLabelDone: { color: C.muted, textDecorationLine: 'line-through' },
    checkSublabel:  { fontFamily: MONO, fontSize: 9, color: C.inkMid, marginTop: 1 },

    logInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    logInput: {
      flex: 1, backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 6,
      paddingHorizontal: 10, paddingVertical: 8, fontFamily: MONO, fontSize: 13, color: C.ink,
    },
    inputError: { borderColor: C.danger },
    logBtn:     { backgroundColor: C.accent, borderRadius: 6, paddingHorizontal: 14, paddingVertical: 8 },
    logBtnText: { fontFamily: MONO, fontSize: 11, fontWeight: '700', color: '#FFFFFF', letterSpacing: 1 },

    pressureEntry:       { paddingVertical: 8 },
    pressureEntryValues: { fontFamily: MONO, fontSize: 11, color: C.inkMid, marginTop: 2 },
    pressureEntryNum:    { color: C.ink, fontWeight: '700' },
    logEntryBorder:  { borderBottomWidth: 1, borderBottomColor: C.border },
    logEntryDate:    { fontFamily: MONO, fontSize: 9, color: C.inkMid },
    emptyNote:       { fontFamily: MONO, fontSize: 10, color: C.muted, marginBottom: 2 },

    milestoneBadge: {
      backgroundColor: C.accentTint, borderWidth: 1, borderColor: C.accentTint,
      borderRadius: 6, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10,
    },
    milestoneBadgeAmber: { backgroundColor: 'rgba(196,136,58,0.15)', borderColor: 'rgba(196,136,58,0.3)' },
    milestoneText:       { fontFamily: MONO, fontSize: 10, letterSpacing: 0.5, color: C.accent, fontWeight: '700' },
    milestoneTextAmber:  { color: C.warning },

    notesInput: {
      backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 6,
      paddingHorizontal: 10, paddingVertical: 8, fontFamily: MONO, fontSize: 12, color: C.ink,
      marginBottom: 8, minHeight: 52, textAlignVertical: 'top',
    },
    logServiceBtn:     { backgroundColor: C.white, borderWidth: 1, borderColor: C.accent, borderRadius: 6, paddingVertical: 10, alignItems: 'center' },
    logServiceBtnText: { fontFamily: MONO, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, color: C.accent },

    entryDel: { fontFamily: MONO, fontSize: 12, color: C.danger, paddingLeft: 8 },
    svcEntry: { paddingVertical: 8 },
    svcEntryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
    svcOdometer: { fontFamily: MONO, fontSize: 12, fontWeight: '700', color: C.ink },
    svcNotes:    { fontFamily: MONO, fontSize: 10, color: C.inkMid, lineHeight: 15 },

    logModBtn:     { backgroundColor: C.accentTint, borderWidth: 1, borderColor: C.accentTint, borderRadius: 5, paddingHorizontal: 10, paddingVertical: 4 },
    logModBtnText: { fontFamily: MONO, fontSize: 9, fontWeight: '700', color: C.accent, letterSpacing: 1 },

    modCard:   { backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 6, padding: 10, marginBottom: 6 },
    modCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 },
    modCategoryBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
    modCategoryText:  { fontFamily: MONO, fontSize: 8, fontWeight: '700', letterSpacing: 1 },
    modDate:      { fontFamily: MONO, fontSize: 9, color: C.inkMid },
    modComponent: { fontFamily: MONO, fontSize: 12, fontWeight: '700', color: C.ink, marginBottom: 2 },
    modNotes:     { fontFamily: MONO, fontSize: 10, color: C.inkMid, lineHeight: 15 },

    opsBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: C.white, borderWidth: 1, borderColor: C.border,
      borderRadius: 6, paddingHorizontal: 12, paddingVertical: 12, marginBottom: 6,
    },
    opsBtnIcon:  { fontSize: 14, width: 20, textAlign: 'center' },
    opsBtnLabel: { flex: 1, fontFamily: MONO, fontSize: 11, letterSpacing: 1, color: C.ink, fontWeight: '600' },
    opsBtnArrow: { fontSize: 18, color: C.muted },

    unlockCard:  { backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 16, alignItems: 'center', gap: 6 },
    unlockIcon:  { fontSize: 22, marginBottom: 2 },
    unlockTitle: { fontFamily: MONO, fontSize: 12, fontWeight: '700', letterSpacing: 1, color: C.ink },
    unlockBody:  { fontSize: 12, color: C.inkMid, textAlign: 'center', lineHeight: 18, marginTop: 2 },
    unlockCta:   { fontFamily: MONO, fontSize: 10, color: C.accent, textAlign: 'center', marginTop: 4, letterSpacing: 0.3 },

    profileCard: { backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
    profileName: { fontFamily: MONO, fontSize: 14, fontWeight: '700', color: C.ink },
    profileSub:  { fontFamily: MONO, fontSize: 10, color: C.inkMid, marginTop: 2 },

    dataBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: C.white, borderWidth: 1, borderColor: C.border,
      borderRadius: 6, paddingHorizontal: 12, paddingVertical: 12, marginBottom: 6,
    },
    dataBtnDestructive:        { borderColor: 'rgba(192,57,43,0.3)', backgroundColor: C.dangerTint },
    dataBtnIcon:               { fontSize: 16, width: 20, textAlign: 'center', color: C.accent, fontWeight: '700' },
    dataBtnIconDestructive:    { color: C.danger },
    dataBtnContent:            { flex: 1 },
    dataBtnLabel:              { fontFamily: MONO, fontSize: 11, fontWeight: '700', letterSpacing: 1, color: C.ink },
    dataBtnLabelDestructive:   { color: C.danger },
    dataBtnSub:                { fontFamily: MONO, fontSize: 9, color: C.inkMid, marginTop: 2 },
    dataBtnArrow:              { fontSize: 18, color: C.muted },
    versionLabel:              { fontSize: 11, color: C.muted, textAlign: 'center', marginTop: 28, marginBottom: 4 },

    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
    modalSheet: {
      backgroundColor: C.white, borderTopLeftRadius: 14, borderTopRightRadius: 14, maxHeight: '78%',
      shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 10,
    },
    modalHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border,
    },
    modalTitle:  { fontFamily: MONO, fontSize: 12, fontWeight: '700', letterSpacing: 1.5, color: C.ink },
    modalCancel: { fontSize: 15, color: C.inkMid },
    modalSave:   { fontSize: 15, color: C.accent, fontWeight: '700' },
    modalSection: { paddingHorizontal: 16, paddingTop: 14 },
    modalLabel:  { fontFamily: MONO, fontSize: 8, letterSpacing: 1.5, color: C.inkMid, textTransform: 'uppercase', marginBottom: 8 },
    categoryChips: { gap: 6, paddingBottom: 2 },
    categoryChip:  { borderWidth: 1, borderColor: C.border, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: C.white },
    categoryChipText: { fontFamily: MONO, fontSize: 11, color: C.inkMid },
    tireHint:     { marginTop: 8, backgroundColor: C.accentTint, borderRadius: 5, paddingHorizontal: 10, paddingVertical: 6 },
    tireHintText: { fontFamily: MONO, fontSize: 9, color: C.accent, letterSpacing: 0.3 },
    modalInput: {
      backgroundColor: C.background, borderWidth: 1, borderColor: C.border, borderRadius: 6,
      paddingHorizontal: 10, paddingVertical: 9, fontFamily: MONO, fontSize: 13, color: C.ink,
    },
    modalNotesInput: { minHeight: 72, textAlignVertical: 'top' },
    modalDateText:   { fontFamily: MONO, fontSize: 12, color: C.inkMid },
  }), [C]);

  const displayName = state.nickname || (state.model ? `${state.make} ${state.model}` : state.make);
  const checklist = state.checklistState ?? {};
  const pressureLog = [...(state.tirePressureLog ?? [])].reverse().slice(0, 5);
  const svcLog = (state.serviceLog ?? []).map((entry, origIdx) => ({ entry, origIdx })).reverse();
  const modLog = [...(state.modLog ?? [])].reverse();
  const hasApiKey = !!(state.apiKey && state.apiKey.length > 10);
  const gearItems = buildGearItems(state);
  const ns = nextService(state.odometer);
  const miToService = Math.max(0, ns - state.odometer);
  const serviceNear = miToService < 50;

  const checkedCount =
    (checklist['tire-pressure'] ? 1 : 0) +
    (checklist['lights'] ? 1 : 0) +
    (checklist['brakes'] ? 1 : 0) +
    (checklist['battery'] ? 1 : 0) +
    gearItems.filter(i => checklist[i.key]).length;
  const totalItems = 4 + gearItems.length;

  function toggleItem(key: string) { update({ checklistState: { ...checklist, [key]: !checklist[key] } }); }
  function toggleTirePressure() { update({ checklistState: { ...checklist, 'tire-pressure': !checklist['tire-pressure'] } }); }

  function logPsi() {
    const front = parseFloat(frontPsiInput);
    const rear  = parseFloat(rearPsiInput);
    if (isNaN(front) || front <= 0 || isNaN(rear) || rear <= 0) {
      setPsiError(true);
      setTimeout(() => setPsiError(false), 1400);
      return;
    }
    const entry: TirePressureEntry = { front, rear, date: formatDate() };
    update({ tirePressureLog: [...(state.tirePressureLog ?? []), entry] });
    setFrontPsiInput('');
    setRearPsiInput('');
  }

  function logService() {
    const entry: ServiceLogEntry = { date: formatDate(), notes: serviceNotes.trim() || 'Service performed', odometer: state.odometer };
    update({ serviceLog: [...(state.serviceLog ?? []), entry] });
    setServiceNotes('');
  }

  function deleteServiceEntry(origIdx: number) {
    Alert.alert('Remove Entry', 'Delete this service event from the log?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => update({ serviceLog: state.serviceLog.filter((_, i) => i !== origIdx) }) },
    ]);
  }

  function deleteModEntry(mod: ModLogEntry) {
    Alert.alert('Remove Mod', 'Delete this entry from the mod log?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: () => {
          const newLog = state.modLog.filter(m => m.id !== mod.id);
          const affectsTireSpec = mod.category === 'Tires' && state.tireSizeFromMod && state.tireSize === mod.component;
          if (!affectsTireSpec) { update({ modLog: newLog }); return; }
          const prevTireMod = [...newLog].reverse().find(m => m.category === 'Tires');
          Alert.alert('Tire Spec',
            prevTireMod
              ? `This mod set the current tire spec. Revert to "${prevTireMod.component}" or keep "${mod.component}"?`
              : `This mod set the current tire spec. Clear the BIKE tab tire spec or keep "${mod.component}"?`,
            [
              {
                text: prevTireMod ? `Revert to "${prevTireMod.component}"` : 'Clear spec',
                onPress: () => update({ modLog: newLog, tireSize: prevTireMod ? prevTireMod.component : '', tireSizeFromMod: !!prevTireMod }),
              },
              { text: `Keep "${mod.component}"`, onPress: () => update({ modLog: newLog, tireSizeFromMod: false }) },
            ]
          );
        },
      },
    ]);
  }

  function openModModal() {
    setModCategory('Tires');
    setModComponent('');
    setModNotes('');
    setModComponentError(false);
    setModModalVisible(true);
  }

  function saveMod() {
    const trimmedComponent = modComponent.trim();
    if (!trimmedComponent) {
      setModComponentError(true);
      setTimeout(() => setModComponentError(false), 1400);
      return;
    }
    const entry: ModLogEntry = { id: Date.now().toString(), category: modCategory, component: trimmedComponent, notes: modNotes.trim(), date: formatDate() };
    const updates: Partial<AppState> = { modLog: [...(state.modLog ?? []), entry] };
    if (modCategory === 'Tires') { updates.tireSize = trimmedComponent; updates.tireSizeFromMod = true; }
    update(updates);
    setModModalVisible(false);
  }

  async function handleExport() {
    setDataLoading('export');
    try { await exportData(state); }
    catch (err: any) { Alert.alert('Export Failed', err?.message || 'Could not export data.'); }
    finally { setDataLoading(null); }
  }

  async function handleExportCsv() {
    setDataLoading('csv');
    try { await exportRidesCsv(state); }
    catch (err: any) { Alert.alert('CSV Export Failed', err?.message || 'Could not export ride data.'); }
    finally { setDataLoading(null); }
  }

  async function handleImportCsv() {
    setDataLoading('importCsv');
    try {
      const incoming = await importRidesCsv();
      update({ rideLog: [...state.rideLog, ...incoming] });
      Alert.alert('CSV Imported', `${incoming.length} ride${incoming.length !== 1 ? 's' : ''} added.`);
    } catch (err: any) {
      if (!DocumentPicker.isCancel(err)) Alert.alert('CSV Import Failed', err?.message || 'Could not read CSV.');
    }
    finally { setDataLoading(null); }
  }

  async function handleImport() {
    setDataLoading('import');
    try {
      const imported = await importData();
      if (!imported) { setDataLoading(null); return; }
      update({ ...imported, apiKey: state.apiKey || imported.apiKey });
      Alert.alert('Import Successful', 'Backup restored. Your API key was preserved.');
    } catch (err: any) {
      if (!DocumentPicker.isCancel(err)) Alert.alert('Import Failed', err?.message || 'Could not read backup file.');
    }
    finally { setDataLoading(null); }
  }

  function handleResetBikeProfile() {
    Alert.alert('Reset Bike Profile', 'Restore Make, Model, and Nickname to defaults? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: () => update({ make: DEFAULT_STATE.make, model: DEFAULT_STATE.model, nickname: DEFAULT_STATE.nickname }) },
    ]);
  }

  function handleReset() {
    Alert.alert('Reset App Data', 'This will delete all rides, logs, mods, settings, and messages. Your API key will be preserved. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: onReset },
    ]);
  }

  const MODE_LABELS: Record<ThemeMode, string> = { day: 'DAY', night: 'NIGHT', auto: 'AUTO' };
  const MODE_SUBS: Record<ThemeMode, string>   = { day: 'light', night: 'dark', auto: resolvedMode };

  return (
    <>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>

        {/* ── CHARGING ── */}
        <CollapsibleSection title="CHARGING" defaultOpen={true}>
          {!chargeSession.isCharging ? (
            <View style={styles.card}>
              <View style={styles.logInputRow}>
                <TextInput style={styles.logInput}
                  value={startPctInput}
                  onChangeText={setStartPctInput}
                  keyboardType="number-pad"
                  placeholder={`Current % (e.g. ${lastKnownBlePct ?? state.battery})`}
                  placeholderTextColor={C.muted} />
              </View>
              <TouchableOpacity style={styles.logServiceBtn} onPress={startCharging} activeOpacity={0.8}>
                <Text style={styles.logServiceBtnText}>START CHARGING</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.card}>
              <View style={[styles.milestoneBadge, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
                <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: C.telemetry }} />
                <Text style={[styles.milestoneText, { color: C.telemetry }]}>ON CHARGER</Text>
              </View>

              <View style={[styles.svcEntryTop, { marginBottom: 4 }]}>
                <Text style={styles.checkLabel}>Elapsed</Text>
                <Text style={styles.svcOdometer}>{elapsedLabel(chargeSession.startTime!)}</Text>
              </View>
              <View style={[styles.svcEntryTop, { marginBottom: 10 }]}>
                <Text style={styles.checkLabel}>Est. charged</Text>
                <Text style={[styles.svcOdometer, { color: C.accent }]}>{chargeEstimate.pct.toFixed(0)}%</Text>
              </View>
              <Text style={[styles.emptyNote, { marginBottom: 10 }]}>
                {chargeEstimate.confidence === 'calibrated'
                  ? 'Estimate calibrated from your last actual reading.'
                  : 'Default estimate — log an actual reading to calibrate.'}
              </Text>

              {actualInputMode === null ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity style={[styles.modePill, { flex: 1 }]} onPress={() => openActualInput('update')} activeOpacity={0.7}>
                    <Text style={styles.modePillText}>UPDATE ACTUAL %</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.modePill, { flex: 1, backgroundColor: C.accentTint, borderColor: C.accentTint }]}
                    onPress={() => openActualInput('done')} activeOpacity={0.7}>
                    <Text style={[styles.modePillText, { color: C.accent }]}>DONE CHARGING</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.logInputRow}>
                  <TextInput style={[styles.logInput, actualPctError && styles.inputError]}
                    value={actualPctInput}
                    onChangeText={setActualPctInput}
                    keyboardType="number-pad"
                    placeholder="Actual % from bike display"
                    placeholderTextColor={C.muted}
                    autoFocus />
                  <TouchableOpacity style={styles.logBtn} onPress={confirmActualInput} activeOpacity={0.8}>
                    <Text style={styles.logBtnText}>{actualInputMode === 'done' ? 'FINISH' : 'SAVE'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.logBtn} onPress={() => setActualInputMode(null)} activeOpacity={0.8}>
                    <Text style={styles.logBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </CollapsibleSection>

        <View style={styles.divider} />

        {/* ── NOTIFICATIONS ── */}
        <CollapsibleSection title="NOTIFICATIONS" defaultOpen={false}>
          <Text style={[styles.checkLabel, { marginBottom: 10 }]}>DAILY PREFLIGHT CHECK</Text>
          <Text style={[styles.checkSublabel, { marginBottom: 12 }]}>
            Choose a time to be reminded. Tap a category to set the alarm — adjust in the picker. Up to 3 alarms.
          </Text>

          {/* Category tiles */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {([
              { label: 'Morning',   h: 5,  m: 30 },
              { label: 'Midday',    h: 12, m: 0  },
              { label: 'Afternoon', h: 15, m: 30 },
              { label: 'Evening',   h: 18, m: 0  },
              { label: 'Custom',    h: -1, m: -1 },
            ] as const).map(cat => (
              <TouchableOpacity
                key={cat.label}
                style={[styles.modePill, { minWidth: 80, alignItems: 'center' }]}
                disabled={(state.preflightSchedules ?? []).length >= 3}
                onPress={() => {
                  if (cat.h === -1) {
                    // Custom — open picker cold (no pre-seed)
                    setPickerHour(12);
                    setPickerMinute(0);
                    setPickerAmPm('PM');
                  } else {
                    const ampm = cat.h >= 12 ? 'PM' : 'AM';
                    const h12  = cat.h % 12 === 0 ? 12 : cat.h % 12;
                    setPickerHour(h12);
                    setPickerMinute(cat.m);
                    setPickerAmPm(ampm);
                  }
                  setTimePickerVisible(true);
                }}>
                <Text style={styles.modePillText}>{cat.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {(state.preflightSchedules ?? []).length >= 3 && (
            <Text style={[styles.checkSublabel, { color: C.accent, marginBottom: 8 }]}>
              Max 3 alarms — remove one to add another.
            </Text>
          )}

          {/* Active schedule list */}
          {(state.preflightSchedules ?? []).map(s => {
            const ampm = s.hour >= 12 ? 'PM' : 'AM';
            const h12  = s.hour % 12 === 0 ? 12 : s.hour % 12;
            const label = `${h12}:${String(s.minute).padStart(2, '0')} ${ampm}`;
            return (
              <View key={s.id} style={[styles.rigToggleRow, { marginBottom: 6, backgroundColor: C.surface, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8 }]}>
                <Text style={[styles.checkLabel, { fontSize: 14 }]}>{label} — daily</Text>
                <TouchableOpacity
                  onPress={() => {
                    const next = (state.preflightSchedules ?? []).filter(x => x.id !== s.id);
                    update({ preflightSchedules: next });
                    if (next.length === 0) {
                      cancelAllPreflightNotifications();
                    } else {
                      schedulePreflightNotifications(next);
                    }
                  }}>
                  <Text style={{ color: C.accent, fontFamily: 'Courier New', fontSize: 13, fontWeight: '700' }}>REMOVE</Text>
                </TouchableOpacity>
              </View>
            );
          })}

          {(state.preflightSchedules ?? []).length === 0 && (
            <Text style={[styles.checkSublabel, { fontStyle: 'italic' }]}>No alarms set.</Text>
          )}
        </CollapsibleSection>

        {/* Time Picker Modal */}
        <Modal visible={timePickerVisible} transparent animationType="fade">
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' }}>
            <View style={{ backgroundColor: C.surface, borderRadius: 12, padding: 24, width: 280 }}>
              <Text style={[styles.checkLabel, { marginBottom: 16, textAlign: 'center' }]}>SET ALARM TIME</Text>

              {/* Hour / Minute / AM-PM steppers */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 20 }}>
                {/* Hour */}
                <View style={{ alignItems: 'center' }}>
                  <TouchableOpacity onPress={() => setPickerHour(h => h === 12 ? 1 : h + 1)} style={{ padding: 8 }}>
                    <Text style={{ color: C.ink, fontSize: 20, fontFamily: 'Courier New' }}>+</Text>
                  </TouchableOpacity>
                  <Text style={{ color: C.ink, fontSize: 28, fontFamily: 'Courier New', fontWeight: '700', minWidth: 40, textAlign: 'center' }}>
                    {String(pickerHour).padStart(2, '0')}
                  </Text>
                  <TouchableOpacity onPress={() => setPickerHour(h => h === 1 ? 12 : h - 1)} style={{ padding: 8 }}>
                    <Text style={{ color: C.ink, fontSize: 20, fontFamily: 'Courier New' }}>−</Text>
                  </TouchableOpacity>
                </View>

                <Text style={{ color: C.ink, fontSize: 28, fontFamily: 'Courier New', fontWeight: '700' }}>:</Text>

                {/* Minute */}
                <View style={{ alignItems: 'center' }}>
                  <TouchableOpacity onPress={() => setPickerMinute(m => (m + 5) % 60)} style={{ padding: 8 }}>
                    <Text style={{ color: C.ink, fontSize: 20, fontFamily: 'Courier New' }}>+</Text>
                  </TouchableOpacity>
                  <Text style={{ color: C.ink, fontSize: 28, fontFamily: 'Courier New', fontWeight: '700', minWidth: 40, textAlign: 'center' }}>
                    {String(pickerMinute).padStart(2, '0')}
                  </Text>
                  <TouchableOpacity onPress={() => setPickerMinute(m => (m - 5 + 60) % 60)} style={{ padding: 8 }}>
                    <Text style={{ color: C.ink, fontSize: 20, fontFamily: 'Courier New' }}>−</Text>
                  </TouchableOpacity>
                </View>

                {/* AM/PM toggle */}
                <TouchableOpacity
                  onPress={() => setPickerAmPm(p => p === 'AM' ? 'PM' : 'AM')}
                  style={{ backgroundColor: C.border, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8 }}>
                  <Text style={{ color: C.ink, fontSize: 18, fontFamily: 'Courier New', fontWeight: '700' }}>{pickerAmPm}</Text>
                </TouchableOpacity>
              </View>

              {/* Confirm / Cancel */}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  style={[styles.modePill, { flex: 1, alignItems: 'center' }]}
                  onPress={() => setTimePickerVisible(false)}>
                  <Text style={styles.modePillText}>CANCEL</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modePillActive, { flex: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center' }]}
                  onPress={() => {
                    // Convert 12h → 24h
                    let h24 = pickerHour % 12;
                    if (pickerAmPm === 'PM') h24 += 12;
                    const id = `${Date.now()}-${h24}-${pickerMinute}`;
                    const newSchedule: PreflightSchedule = { id, hour: h24, minute: pickerMinute };
                    const next = [...(state.preflightSchedules ?? []).slice(0, 2), newSchedule];
                    update({ preflightSchedules: next, preflightNotifEnabled: true });
                    schedulePreflightNotifications(next);
                    setTimePickerVisible(false);
                  }}>
                  <Text style={styles.modePillTextActive}>SET ALARM</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* ── DISPLAY MODE ── */}
        <CollapsibleSection title="DISPLAY MODE" defaultOpen={true}>
          <View style={styles.modeToggleRow}>
            {(['day', 'night', 'auto'] as ThemeMode[]).map(m => {
              const isActive = mode === m;
              return (
                <TouchableOpacity key={m}
                  style={[styles.modePill, isActive && styles.modePillActive]}
                  onPress={() => setMode(m)}
                  activeOpacity={0.7}>
                  <Text style={[styles.modePillText, isActive && styles.modePillTextActive]}>
                    {MODE_LABELS[m]}
                  </Text>
                  <Text style={[styles.modePillSub, isActive && styles.modeActiveSub]}>
                    {MODE_SUBS[m]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </CollapsibleSection>

        <View style={styles.divider} />

        {/* ── HARDWARE STATUS ── */}
        <CollapsibleSection title="HARDWARE STATUS" defaultOpen={false}>
          <View style={styles.rigCard}>
            <View style={styles.rigField}>
              <Text style={styles.rigFieldLabel}>DEVICE NAME</Text>
              <TextInput style={styles.rigInput} value={state.rigDeviceName}
                onChangeText={v => update({ rigDeviceName: v })}
                placeholder="e.g. Samsung S8" placeholderTextColor={C.muted} autoCorrect={false} />
            </View>
            <View style={styles.rigField}>
              <Text style={styles.rigFieldLabel}>MOUNT TYPE</Text>
              <View style={styles.chipRow}>
                {MOUNT_TYPES.map(mt => (
                  <TouchableOpacity key={mt}
                    style={[styles.chip, state.rigMountType === mt && styles.chipActive]}
                    onPress={() => update({ rigMountType: state.rigMountType === mt ? '' : mt })} activeOpacity={0.7}>
                    <Text style={[styles.chipText, state.rigMountType === mt && styles.chipTextActive]}>{mt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.rigField}>
              <Text style={styles.rigFieldLabel}>PRIMARY USE</Text>
              <View style={styles.chipRow}>
                {PRIMARY_USES.map(pu => (
                  <TouchableOpacity key={pu}
                    style={[styles.chip, state.rigPrimaryUse === pu && styles.chipActive]}
                    onPress={() => update({ rigPrimaryUse: state.rigPrimaryUse === pu ? '' : pu })} activeOpacity={0.7}>
                    <Text style={[styles.chipText, state.rigPrimaryUse === pu && styles.chipTextActive]}>{pu}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.rigToggleRow}>
              <Text style={[styles.toggleStatus, state.rigOnline && styles.toggleStatusOn]}>
                {state.rigOnline ? 'ONLINE' : 'OFFLINE'}
              </Text>
              <Switch value={state.rigOnline} onValueChange={v => update({ rigOnline: v })}
                trackColor={{ false: C.border, true: C.accentTint }}
                thumbColor={state.rigOnline ? C.accent : C.muted} />
            </View>
          </View>
        </CollapsibleSection>

        <View style={styles.divider} />

        {/* ── PRE-MISSION CHECKLIST ── */}
        <CollapsibleSection title="PRE-MISSION CHECKLIST" defaultOpen={false}
          badge={`${checkedCount}/${totalItems}`}
          right={
            <TouchableOpacity onPress={() => update({ checklistState: {} })} activeOpacity={0.7}>
              <Text style={styles.resetBtn}>RESET</Text>
            </TouchableOpacity>
          }>
          <>
            <View style={styles.progressRow}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${totalItems > 0 ? (checkedCount / totalItems) * 100 : 0}%` as any }]} />
              </View>
              <Text style={styles.progressLabel}>{checkedCount}/{totalItems}</Text>
            </View>
            <View style={styles.card}>
              <View style={styles.checkRow}>
                <TouchableOpacity style={[styles.checkbox, checklist['tire-pressure'] && styles.checkboxChecked]}
                  onPress={toggleTirePressure} activeOpacity={0.7}>
                  {checklist['tire-pressure'] && <Text style={styles.checkmark}>✓</Text>}
                </TouchableOpacity>
                <View style={styles.checkContent}>
                  <Text style={[styles.checkLabel, checklist['tire-pressure'] && styles.checkLabelDone]}>Tire pressure</Text>
                </View>
              </View>
              {[
                { key: 'lights',  label: 'Lights',  sublabel: 'Front & rear operational' },
                { key: 'brakes',  label: 'Brakes',  sublabel: 'Front & rear responsive' },
                { key: 'battery', label: 'Battery', sublabel: `Current: ${state.battery}%` },
              ].map(item => (
                <View key={item.key} style={styles.checkRow}>
                  <TouchableOpacity style={[styles.checkbox, checklist[item.key] && styles.checkboxChecked]}
                    onPress={() => toggleItem(item.key)} activeOpacity={0.7}>
                    {checklist[item.key] && <Text style={styles.checkmark}>✓</Text>}
                  </TouchableOpacity>
                  <View style={styles.checkContent}>
                    <Text style={[styles.checkLabel, checklist[item.key] && styles.checkLabelDone]}>{item.label}</Text>
                    <Text style={styles.checkSublabel}>{item.sublabel}</Text>
                  </View>
                </View>
              ))}
              {gearItems.map(item => (
                <View key={item.key} style={styles.checkRow}>
                  <TouchableOpacity style={[styles.checkbox, checklist[item.key] && styles.checkboxChecked]}
                    onPress={() => toggleItem(item.key)} activeOpacity={0.7}>
                    {checklist[item.key] && <Text style={styles.checkmark}>✓</Text>}
                  </TouchableOpacity>
                  <View style={styles.checkContent}>
                    <Text style={[styles.checkLabel, checklist[item.key] && styles.checkLabelDone]}>{item.label}</Text>
                    <Text style={styles.checkSublabel}>{item.sublabel}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        </CollapsibleSection>

        <View style={styles.divider} />

        {/* ── TIRE PRESSURE LOG ── */}
        <CollapsibleSection title="TIRE PRESSURE LOG" defaultOpen={true}>
          <View style={styles.logInputRow}>
            <TextInput style={[styles.logInput, psiError && styles.inputError]}
              value={frontPsiInput} onChangeText={setFrontPsiInput}
              keyboardType="decimal-pad" placeholder="Front PSI" placeholderTextColor={C.muted} />
            <TextInput style={[styles.logInput, psiError && styles.inputError]}
              value={rearPsiInput} onChangeText={setRearPsiInput}
              keyboardType="decimal-pad" placeholder="Rear PSI" placeholderTextColor={C.muted} />
            <TouchableOpacity style={styles.logBtn} onPress={logPsi} activeOpacity={0.8}>
              <Text style={styles.logBtnText}>LOG</Text>
            </TouchableOpacity>
          </View>
          {pressureLog.length > 0 ? (
            <View style={styles.card}>
              {pressureLog.map((entry, i) => (
                <View key={i} style={[styles.pressureEntry, i < pressureLog.length - 1 && styles.logEntryBorder]}>
                  <Text style={styles.logEntryDate}>{entry.date}</Text>
                  <Text style={styles.pressureEntryValues}>
                    Front: <Text style={styles.pressureEntryNum}>{entry.front} PSI</Text>
                    {'  /  '}
                    Rear: <Text style={styles.pressureEntryNum}>{entry.rear} PSI</Text>
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyNote}>No pressure readings logged</Text>
          )}
        </CollapsibleSection>

        <View style={styles.divider} />

        {/* ── SERVICE LOG ── */}
        <CollapsibleSection title="SERVICE LOG" defaultOpen={false}>
          <View style={[styles.milestoneBadge, serviceNear && styles.milestoneBadgeAmber]}>
            <Text style={[styles.milestoneText, serviceNear && styles.milestoneTextAmber]}>
              NEXT SERVICE: {ns.toFixed(0)} mi{'  ·  '}{miToService.toFixed(0)} mi away
            </Text>
          </View>
          <TextInput style={styles.notesInput} value={serviceNotes} onChangeText={setServiceNotes}
            placeholder="Notes — e.g. Rear tire swap, chain lube, brake pads..."
            placeholderTextColor={C.muted} multiline numberOfLines={2} />
          <TouchableOpacity style={styles.logServiceBtn} onPress={logService} activeOpacity={0.8}>
            <Text style={styles.logServiceBtnText}>LOG SERVICE EVENT</Text>
          </TouchableOpacity>
          {svcLog.length > 0 && (
            <View style={[styles.card, { marginTop: 10 }]}>
              {svcLog.map(({ entry, origIdx }, i) => (
                <View key={origIdx} style={[styles.svcEntry, i < svcLog.length - 1 && styles.logEntryBorder]}>
                  <View style={styles.svcEntryTop}>
                    <Text style={styles.svcOdometer}>{entry.odometer.toFixed(1)} mi</Text>
                    <Text style={styles.logEntryDate}>{entry.date}</Text>
                    <TouchableOpacity onPress={() => deleteServiceEntry(origIdx)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={styles.entryDel}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  {entry.notes ? <Text style={styles.svcNotes}>{entry.notes}</Text> : null}
                </View>
              ))}
            </View>
          )}
          {svcLog.length === 0 && <Text style={styles.emptyNote}>No service events logged</Text>}
        </CollapsibleSection>

        <View style={styles.divider} />

        {/* ── MOD LOG ── */}
        <CollapsibleSection title="MOD LOG" defaultOpen={true}
          right={
            <TouchableOpacity style={styles.logModBtn} onPress={openModModal} activeOpacity={0.7}>
              <Text style={styles.logModBtnText}>+ LOG MOD</Text>
            </TouchableOpacity>
          }>
          {modLog.length > 0 ? modLog.map(mod => (
            <View key={mod.id} style={styles.modCard}>
              <View style={styles.modCardHeader}>
                <View style={[styles.modCategoryBadge, { backgroundColor: MOD_COLORS[mod.category].bg }]}>
                  <Text style={[styles.modCategoryText, { color: MOD_COLORS[mod.category].text }]}>
                    {mod.category.toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.modDate}>{mod.date}</Text>
                <TouchableOpacity onPress={() => deleteModEntry(mod)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.entryDel}>✕</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.modComponent}>{mod.component}</Text>
              {mod.notes ? <Text style={styles.modNotes}>{mod.notes}</Text> : null}
            </View>
          )) : (
            <Text style={styles.emptyNote}>No mods logged</Text>
          )}
        </CollapsibleSection>

        <View style={styles.divider} />

        {/* ── AI ANALYSIS ── */}
        <CollapsibleSection title="AI ANALYSIS" defaultOpen={true}>
          {hasApiKey ? (
            <>
              {[
                { icon: '▶', label: 'PRE-MISSION CHECK',  key: 'pre-mission' as keyof typeof OPS_PROMPTS },
                { icon: '⚡', label: 'BMS CALIBRATION',   key: 'bms'         as keyof typeof OPS_PROMPTS },
                { icon: '🔧', label: 'SERVICE INTERVAL',  key: 'service'     as keyof typeof OPS_PROMPTS },
                { icon: '🎽', label: 'GEAR CHECK',        key: 'gear'        as keyof typeof OPS_PROMPTS },
                { icon: '📋', label: 'MISSION DEBRIEF',   key: 'debrief'     as keyof typeof OPS_PROMPTS },
              ].map(({ icon, label, key }) => (
                <TouchableOpacity key={key} style={styles.opsBtn}
                  onPress={() => onMissionAction(OPS_PROMPTS[key])} activeOpacity={0.7}>
                  <Text style={styles.opsBtnIcon}>{icon}</Text>
                  <Text style={styles.opsBtnLabel}>{label}</Text>
                  <Text style={styles.opsBtnArrow}>›</Text>
                </TouchableOpacity>
              ))}
            </>
          ) : (
            <View style={styles.unlockCard}>
              <Text style={styles.unlockIcon}>🔑</Text>
              <Text style={styles.unlockTitle}>Unlock AI Analysis</Text>
              <Text style={styles.unlockBody}>
                Pre-Mission Check, BMS Calibration, Service Interval, Gear Check, and Mission Debrief use live telemetry to give tactical guidance.
              </Text>
              <Text style={styles.unlockCta}>Add your Anthropic API key in the CHAT tab to activate.</Text>
            </View>
          )}
        </CollapsibleSection>

        <View style={styles.divider} />

        {/* ── BIKE PROFILE ── */}
        <CollapsibleSection title="BIKE PROFILE" defaultOpen={true}>
          <View style={styles.profileCard}>
            <Text style={styles.profileName}>{displayName}</Text>
            {state.nickname ? <Text style={styles.profileSub}>{state.make} {state.model}</Text> : null}
          </View>
          <TouchableOpacity style={styles.dataBtn} onPress={onEditProfile} activeOpacity={0.7}>
            <Text style={styles.dataBtnIcon}>✎</Text>
            <View style={styles.dataBtnContent}>
              <Text style={styles.dataBtnLabel}>EDIT BIKE PROFILE</Text>
              <Text style={styles.dataBtnSub}>Update make, model, and nickname</Text>
            </View>
            <Text style={styles.dataBtnArrow}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.dataBtn, styles.dataBtnDestructive]} onPress={handleResetBikeProfile} activeOpacity={0.7}>
            <Text style={[styles.dataBtnIcon, styles.dataBtnIconDestructive]}>⊘</Text>
            <View style={styles.dataBtnContent}>
              <Text style={[styles.dataBtnLabel, styles.dataBtnLabelDestructive]}>RESET BIKE PROFILE</Text>
              <Text style={styles.dataBtnSub}>Restore default make, model, and nickname</Text>
            </View>
            <Text style={styles.dataBtnArrow}>›</Text>
          </TouchableOpacity>
        </CollapsibleSection>

        <View style={styles.divider} />

        {/* ── DATA MANAGEMENT ── */}
        <CollapsibleSection title="DATA MANAGEMENT" defaultOpen={false}>
          {([
            { key: 'export',    label: 'EXPORT DATA',     sub: 'Share full backup as JSON',      icon: '↑', handler: handleExport    },
            { key: 'csv',       label: 'EXPORT RIDE CSV', sub: 'Share ride log as CSV spreadsheet', icon: '↑', handler: handleExportCsv },
            { key: 'importCsv', label: 'IMPORT RIDE CSV', sub: 'Add rides from a CSV export file',  icon: '↓', handler: handleImportCsv },
            { key: 'import',    label: 'IMPORT DATA',     sub: 'Restore from a JSON backup file',   icon: '↓', handler: handleImport   },
          ] as const).map(({ key, label, sub, icon, handler }) => (
            <TouchableOpacity key={key} style={styles.dataBtn} onPress={handler}
              disabled={dataLoading !== null} activeOpacity={0.7}>
              {dataLoading === key ? (
                <ActivityIndicator size="small" color={C.accent} />
              ) : (
                <Text style={styles.dataBtnIcon}>{icon}</Text>
              )}
              <View style={styles.dataBtnContent}>
                <Text style={styles.dataBtnLabel}>{label}</Text>
                <Text style={styles.dataBtnSub}>{sub}</Text>
              </View>
              <Text style={styles.dataBtnArrow}>›</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={[styles.dataBtn, styles.dataBtnDestructive]} onPress={handleReset}
            disabled={dataLoading !== null} activeOpacity={0.7}>
            <Text style={[styles.dataBtnIcon, styles.dataBtnIconDestructive]}>⊘</Text>
            <View style={styles.dataBtnContent}>
              <Text style={[styles.dataBtnLabel, styles.dataBtnLabelDestructive]}>RESET APP</Text>
              <Text style={styles.dataBtnSub}>Clear all data and restore defaults</Text>
            </View>
            <Text style={styles.dataBtnArrow}>›</Text>
          </TouchableOpacity>
        </CollapsibleSection>

        <Text style={styles.versionLabel}>
          {`eBike Mission Control v${DeviceInfo.getVersion()} (${DeviceInfo.getBuildNumber()})`}
        </Text>

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* ── LOG MOD MODAL ── */}
      <Modal visible={modModalVisible} transparent animationType="slide">
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setModModalVisible(false)} />
        <View style={styles.modalSheet}>
          <SafeAreaView>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setModModalVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>LOG MOD</Text>
              <TouchableOpacity onPress={saveMod} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.modalSave}>Save</Text>
              </TouchableOpacity>
            </View>
            <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
              <View style={styles.modalSection}>
                <Text style={styles.modalLabel}>CATEGORY</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryChips}>
                  {MOD_CATEGORIES.map(cat => (
                    <TouchableOpacity key={cat}
                      style={[styles.categoryChip, modCategory === cat && { backgroundColor: MOD_COLORS[cat].bg, borderColor: MOD_COLORS[cat].text }]}
                      onPress={() => setModCategory(cat)} activeOpacity={0.7}>
                      <Text style={[styles.categoryChipText, modCategory === cat && { color: MOD_COLORS[cat].text, fontWeight: '700' }]}>
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                {modCategory === 'Tires' && (
                  <View style={styles.tireHint}>
                    <Text style={styles.tireHintText}>⚡ Component name will sync to BIKE tab tire spec</Text>
                  </View>
                )}
              </View>
              <View style={styles.modalSection}>
                <Text style={styles.modalLabel}>COMPONENT NAME</Text>
                <TextInput style={[styles.modalInput, modComponentError && styles.inputError]}
                  value={modComponent} onChangeText={setModComponent}
                  placeholder={modCategory === 'Tires' ? 'e.g. Kenda Juggernaut 26x4.0' : 'Component name...'}
                  placeholderTextColor={C.muted} autoCorrect={false} />
              </View>
              <View style={styles.modalSection}>
                <Text style={styles.modalLabel}>NOTES (optional)</Text>
                <TextInput style={[styles.modalInput, styles.modalNotesInput]}
                  value={modNotes} onChangeText={setModNotes}
                  placeholder="Details about the mod..." placeholderTextColor={C.muted}
                  multiline numberOfLines={3} textAlignVertical="top" />
              </View>
              <View style={styles.modalSection}>
                <Text style={styles.modalLabel}>DATE</Text>
                <Text style={styles.modalDateText}>{formatDate()}</Text>
              </View>
              <View style={{ height: 16 }} />
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}
