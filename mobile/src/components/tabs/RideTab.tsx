import React, { useRef, useState, useMemo, useEffect } from 'react';
import {
  Alert,
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { CollapsibleSection } from '../CollapsibleSection';
import { useTheme } from '../../theme/ThemeContext';
import { MONO } from '../../theme/colors';
import { AppState, ChargeLogEntry, RideLogEntry } from '../../state/types';
import { nowTime } from '../../utils/ai';
import { useBleContext } from '../../context/BleContext';

interface Props {
  state: AppState;
  update: (u: Partial<AppState>) => void;
  onSysMsg: (content: string) => void;
}

// ── Week grouping helpers ─────────────────────────────────────────────────────

function weekMonday(isoStr: string): Date {
  const d = new Date(isoStr);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function weekRangeLabel(monday: Date): string {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

function monthHeading(monday: Date): string {
  return monday.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
}

// ─────────────────────────────────────────────────────────────────────────────

export function RideTab({ state, update, onSysMsg }: Props) {
  const { C } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const [chargedToInput, setChargedToInput] = useState('');
  const [chargedToError, setChargedToError] = useState(false);
  const [rideDistInput, setRideDistInput] = useState('');
  const [rideBatInput, setRideBatInput] = useState('');
  const [rideLogError, setRideLogError] = useState<'dist' | 'bat' | null>(null);

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editLoggedAt, setEditLoggedAt] = useState('');   // unique key for edit/delete
  const [editRideDate, setEditRideDate] = useState('');   // display only
  const [editDist, setEditDist] = useState('');
  const [editBat, setEditBat] = useState('');
  const [editMode, setEditMode] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (weekGroups.length > 0 && expandedWeeks.size === 0) {
      setExpandedWeeks(new Set([weekGroups[0].key]));
    }
  }, [weekGroups]);

  const { status, telemetry } = useBleContext();
  const liveBat = status === 'connected' && telemetry?.battery_pct != null
    ? telemetry.battery_pct
    : state.battery;

  const batColor = liveBat < 20 ? C.danger : liveBat < 35 ? C.warning : C.accent;

  const styles = useMemo(() => StyleSheet.create({
    scroll:   { flex: 1, backgroundColor: C.background },
    content:  { padding: 12 },
    section:  {
      fontFamily: MONO, fontSize: 8, letterSpacing: 2, color: C.accent,
      textTransform: 'uppercase', marginBottom: 8, marginTop: 2,
    },
    group:  { marginBottom: 10 },
    label:  { fontFamily: MONO, fontSize: 9, color: C.inkMid, letterSpacing: 0.5, marginBottom: 4 },
    input:  {
      backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 6,
      paddingHorizontal: 10, paddingVertical: 7, fontFamily: MONO, fontSize: 13, color: C.ink,
    },
    inputError: { borderColor: C.danger },
    row:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    batValue: { fontFamily: MONO, fontSize: 16, fontWeight: '700' },
    batControls: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
    stepper: {
      backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 6,
      paddingHorizontal: 10, paddingVertical: 7,
    },
    stepperText: { fontFamily: MONO, fontSize: 12, color: C.inkMid },
    batInput: {
      flex: 1, backgroundColor: C.white, borderWidth: 1, borderColor: C.border, borderRadius: 6,
      paddingHorizontal: 10, paddingVertical: 7, fontFamily: MONO, fontSize: 13, color: C.ink, textAlign: 'center',
    },
    barTrack: { height: 5, backgroundColor: C.border, borderRadius: 3, overflow: 'hidden' },
    barFill:  { height: 5, borderRadius: 3 },
    modeRow:  { flexDirection: 'row', gap: 8 },
    modeBtn:  {
      flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 6,
      paddingVertical: 8, alignItems: 'center', backgroundColor: C.white,
    },
    modeBtnActive:      { backgroundColor: C.accent, borderColor: C.accent },
    modeBtnLabel:       { fontFamily: MONO, fontSize: 11, fontWeight: '700', color: C.inkMid, letterSpacing: 1 },
    modeBtnSub:         { fontFamily: MONO, fontSize: 9, color: C.muted, marginTop: 2 },
    modeBtnLabelActive: { color: '#FFFFFF' },
    divider: { height: 1, backgroundColor: C.border, marginVertical: 10 },
    card: {
      backgroundColor: C.white, borderWidth: 1, borderColor: C.border,
      borderRadius: 6, padding: 10, marginBottom: 10,
    },
    cardTitle: {
      fontFamily: MONO, fontSize: 8, color: C.inkMid, letterSpacing: 1,
      textTransform: 'uppercase', marginBottom: 8,
    },
    flex1: { flex: 1 },
    inlineRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end', marginBottom: 10 },
    actionBtn: { backgroundColor: C.accent, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 7, alignSelf: 'flex-end' },
    actionBtnText: { fontFamily: MONO, fontSize: 11, fontWeight: '700', color: '#FFFFFF', letterSpacing: 1 },
    logModeRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
    logModePill: {
      flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 4,
      paddingVertical: 6, alignItems: 'center', backgroundColor: C.background,
    },
    logModePillActive:     { backgroundColor: C.accent, borderColor: C.accent },
    logModePillText:       { fontFamily: MONO, fontSize: 9, fontWeight: '700', color: C.inkMid, letterSpacing: 0.5 },
    logModePillTextActive: { color: '#FFFFFF' },
    logRideBtn:     { backgroundColor: C.accent, borderRadius: 6, paddingVertical: 10, alignItems: 'center', marginTop: 2 },
    logRideBtnText: { fontFamily: MONO, fontSize: 12, fontWeight: '700', color: '#FFFFFF', letterSpacing: 1.5 },
    // ── History table ────────────────────────────────────────────────────────
    histHeader: {
      flexDirection: 'row', paddingBottom: 5,
      borderBottomWidth: 1, borderBottomColor: C.border, marginBottom: 4,
    },
    histEntry:       { paddingVertical: 5 },
    histEntryBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
    histRow:         { flexDirection: 'row' },
    modeBadge:       { fontFamily: MONO, fontSize: 9, color: C.muted, letterSpacing: 0.5, marginTop: 3, marginBottom: 1 },
    histCell:        { fontFamily: MONO, fontSize: 8, color: C.inkMid, letterSpacing: 0.5 },
    histDate:  { flex: 2.2 },
    histNum:   { flex: 1, textAlign: 'right' },
    histDraw:  { flex: 1.4, textAlign: 'right' },
    histValue: { fontSize: 11, color: C.ink },
    histDrawValue: { fontSize: 11, color: C.accent, fontWeight: '700' },
    histUnit:  { fontSize: 9, color: C.inkMid, fontWeight: '400' },
    // ── Week / month grouping ────────────────────────────────────────────────
    monthRow: {
      flexDirection: 'row', alignItems: 'center',
      marginTop: 10, marginBottom: 4,
    },
    monthText: {
      fontFamily: MONO, fontSize: 8, letterSpacing: 2,
      color: C.accent, marginRight: 8,
    },
    monthLine: { flex: 1, height: 1, backgroundColor: C.border },
    weekHeader: {
      flexDirection: 'row', alignItems: 'center',
      paddingVertical: 9, paddingHorizontal: 10,
      backgroundColor: C.white, borderWidth: 1, borderColor: C.border,
      borderRadius: 6, marginBottom: 4,
    },
    weekHeaderExpanded: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, marginBottom: 0 },
    weekLabelText: { fontFamily: MONO, fontSize: 11, color: C.ink, fontWeight: '600', flex: 1 },
    weekMeta: { fontFamily: MONO, fontSize: 9, color: C.muted, marginTop: 2 },
    weekChevron: { fontFamily: MONO, fontSize: 13, color: C.inkMid, marginLeft: 8 },
    weekBody: {
      backgroundColor: C.white, borderWidth: 1, borderTopWidth: 0, borderColor: C.border,
      borderBottomLeftRadius: 6, borderBottomRightRadius: 6,
      paddingHorizontal: 10, paddingBottom: 6, marginBottom: 10,
    },
    // ── Mode stats ───────────────────────────────────────────────────────────
    modeStatRow:   { flexDirection: 'row', alignItems: 'baseline', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: C.border },
    modeStatLabel: { fontFamily: MONO, fontSize: 10, color: C.inkMid, letterSpacing: 0.5, width: 80 },
    modeStatValue: { fontFamily: MONO, fontSize: 13, color: C.accent, fontWeight: '700', flex: 1 },
    modeStatCount: { fontFamily: MONO, fontSize: 9, color: C.muted },
    // ── Edit modal ───────────────────────────────────────────────────────────
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'center', padding: 16 },
    modalCard: {
      backgroundColor: C.white, borderWidth: 1, borderColor: C.border,
      borderRadius: 10, padding: 16,
    },
    modalTitle:   { fontFamily: MONO, fontSize: 10, fontWeight: '700', color: C.accent, letterSpacing: 2, marginBottom: 2 },
    modalDate:    { fontFamily: MONO, fontSize: 10, color: C.muted, marginBottom: 12 },
    modalDrawRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    modalDrawVal: { fontFamily: MONO, fontSize: 13, color: C.accent, fontWeight: '700' },
    modalBtns:    { flexDirection: 'row', gap: 10, marginTop: 12 },
    modalCancel:  { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 6, paddingVertical: 10, alignItems: 'center' },
    modalCancelText: { fontFamily: MONO, fontSize: 11, color: C.inkMid, letterSpacing: 1 },
    modalSave:    { flex: 1, backgroundColor: C.accent, borderRadius: 6, paddingVertical: 10, alignItems: 'center' },
    modalSaveText:   { fontFamily: MONO, fontSize: 11, fontWeight: '700', color: '#FFFFFF', letterSpacing: 1 },
    modalDeleteDivider: { height: 1, backgroundColor: C.border, marginTop: 14, marginBottom: 10 },
    modalDelete:     { borderWidth: 1, borderColor: C.danger, borderRadius: 6, paddingVertical: 10, alignItems: 'center' },
    modalDeleteText: { fontFamily: MONO, fontSize: 11, fontWeight: '700', color: C.danger, letterSpacing: 1 },
  }), [C]);

  function logCharge() {
    const pct = parseFloat(chargedToInput);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      setChargedToError(true);
      setTimeout(() => setChargedToError(false), 1200);
      return;
    }
    const rounded = Math.round(pct);
    const now = new Date();
    const timeStr =
      now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
      now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const entry: ChargeLogEntry = { pct: rounded, time: timeStr };
    update({ chargeLog: [...state.chargeLog, entry], battery: rounded });
    setChargedToInput('');
    onSysMsg(`⚡ Calibration event logged — charged to ${rounded}% at ${timeStr}. Hard surface, away from exits.`);
  }

  function logRide() {
    const dist = parseFloat(rideDistInput);
    const bat  = parseFloat(rideBatInput);
    if (isNaN(dist) || dist <= 0) { setRideLogError('dist'); setTimeout(() => setRideLogError(null), 1400); return; }
    if (isNaN(bat) || bat <= 0 || bat > 100) { setRideLogError('bat'); setTimeout(() => setRideLogError(null), 1400); return; }
    const drawRate = bat / dist;
    const now = new Date();
    const date = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' +
      now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const entry: RideLogEntry = { distance: dist, batteryUsed: bat, drawRate, date, logged_at: now.toISOString(), rideMode: state.rideMode };
    update({
      rideLog: [...state.rideLog, entry],
      odometer: Math.round((state.odometer + dist) * 10) / 10,
      battery: Math.max(0, Math.round((state.battery - bat) * 10) / 10),
    });
    setRideDistInput('');
    setRideBatInput('');
    onSysMsg(`📍 Mission logged — ${dist.toFixed(1)} mi, ${bat}% used, ${drawRate.toFixed(2)} %/mi draw rate.`);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  }

  function openEditModal(ride: RideLogEntry) {
    const key = ride.logged_at ?? ride.date;
    setEditLoggedAt(key);
    setEditRideDate(ride.date);
    setEditDist(String(ride.distance));
    setEditBat(String(ride.batteryUsed));
    setEditMode(ride.rideMode ?? 'CRUISER');
    setEditNotes(ride.notes ?? '');
    setEditModalVisible(true);
  }

  function saveEdit() {
    const dist = parseFloat(editDist);
    const bat  = parseFloat(editBat);
    if (isNaN(dist) || dist <= 0 || isNaN(bat) || bat < 0 || bat > 100) return;
    const drawRate = dist > 0 ? bat / dist : 0;
    const newLog = state.rideLog.map(r =>
      (r.logged_at ?? r.date) === editLoggedAt
        ? { ...r, distance: Math.round(dist * 10) / 10, batteryUsed: Math.round(bat * 10) / 10,
            drawRate: Math.round(drawRate * 100) / 100, rideMode: editMode,
            notes: editNotes.trim() || undefined }
        : r
    );
    update({ rideLog: newLog });
    setEditModalVisible(false);
  }

  function deleteFromModal() {
    Alert.alert('Delete Ride', 'Delete this ride? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: () => {
          const removed = state.rideLog.find(r => (r.logged_at ?? r.date) === editLoggedAt);
          const newLog  = state.rideLog.filter(r => (r.logged_at ?? r.date) !== editLoggedAt);
          const newOdometer = removed ? Math.max(0, Math.round((state.odometer - removed.distance) * 10) / 10) : state.odometer;
          const newBattery  = removed ? Math.min(100, Math.round((state.battery + removed.batteryUsed) * 10) / 10) : state.battery;
          update({ rideLog: newLog, odometer: newOdometer, battery: newBattery });
          setEditModalVisible(false);
        },
      },
    ]);
  }

  // ── Sort newest-first, then group into calendar weeks ─────────────────────

  const displayRides = useMemo(() =>
    (state.rideLog ?? [])
      .map((ride, origIdx) => ({ ride, origIdx }))
      .sort((a, b) => {
        const ta = a.ride.logged_at ?? a.ride.date;
        const tb = b.ride.logged_at ?? b.ride.date;
        return tb > ta ? 1 : tb < ta ? -1 : 0;
      }),
    [state.rideLog],
  );

  type WeekGroup = {
    key: string;
    label: string;
    month: string;
    monday: Date;
    rides: typeof displayRides;
  };

  const weekGroups = useMemo((): WeekGroup[] => {
    const map = new Map<string, WeekGroup>();
    for (const item of displayRides) {
      const iso = item.ride.logged_at;
      let key: string, label: string, month: string, monday: Date;
      if (iso) {
        monday = weekMonday(iso);
        key    = monday.toISOString().slice(0, 10);
        label  = weekRangeLabel(monday);
        month  = monthHeading(monday);
      } else {
        monday = new Date(0);
        key    = 'unknown';
        label  = 'Unknown date';
        month  = '';
      }
      if (!map.has(key)) map.set(key, { key, label, month, monday, rides: [] });
      map.get(key)!.rides.push(item);
    }
    return Array.from(map.values()); // insertion order = newest-first (displayRides is pre-sorted)
  }, [displayRides]);

  function toggleWeek(key: string, currentlyExpanded: boolean) {
    setExpandedWeeks(prev => {
      const next = new Set(prev);
      currentlyExpanded ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function isWeekExpanded(key: string) {
    return expandedWeeks.has(key);
  }

  // ── Mode stats (distance-weighted draw rate per mode) ─────────────────────

  const modeStats = useMemo(() => {
    const MODE_LABELS: Record<string, string> = { MAX_RANGE: 'MAX RANGE', CRUISER: 'CRUISER', SPORT: 'SPORT', HARD: 'SPORT', CUSTOM: 'CUSTOM' };
    const ORDER = ['MAX_RANGE', 'CRUISER', 'SPORT', 'CUSTOM'];
    const buckets: Record<string, { drawRate: number; distance: number }[]> = {};
    for (const { ride } of displayRides) {
      const key = ride.rideMode ?? 'UNKNOWN';
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push({ drawRate: ride.drawRate, distance: ride.distance });
    }
    if (buckets['HARD']) {
      buckets['SPORT'] = [...(buckets['SPORT'] ?? []), ...buckets['HARD']];
      delete buckets['HARD'];
    }
    const modes = [...ORDER.filter(m => buckets[m]), ...Object.keys(buckets).filter(k => !ORDER.includes(k) && k !== 'UNKNOWN')];
    return modes.map(mode => {
      const rides = buckets[mode];
      const totalDist = rides.reduce((s, r) => s + r.distance, 0);
      const avg = totalDist > 0
        ? rides.reduce((s, r) => s + r.drawRate * r.distance, 0) / totalDist
        : rides.reduce((s, r) => s + r.drawRate, 0) / rides.length;
      return { mode, label: MODE_LABELS[mode] ?? mode, avg, count: rides.length };
    });
  }, [displayRides]);

  return (
    <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.section}>LIVE TELEMETRY</Text>

      <View style={styles.group}>
        <Text style={styles.label}>ODOMETER (mi)</Text>
        <TextInput style={styles.input} keyboardType="decimal-pad"
          value={state.odometer === 0 ? '' : String(state.odometer)}
          placeholder="0.0" placeholderTextColor={C.muted}
          onChangeText={v => update({ odometer: parseFloat(v) || 0 })} />
      </View>

      <View style={styles.group}>
        <View style={styles.row}>
          <Text style={styles.label}>BATTERY %{status === 'connected' ? '  ⚡ LIVE' : ''}</Text>
          <Text style={[styles.batValue, { color: batColor }]}>{liveBat.toFixed(0)}%</Text>
        </View>
        <View style={styles.batControls}>
          <TouchableOpacity style={styles.stepper} onPress={() => update({ battery: Math.max(0, state.battery - 5) })}>
            <Text style={styles.stepperText}>−5</Text>
          </TouchableOpacity>
          <TextInput style={styles.batInput} keyboardType="number-pad" value={String(state.battery)}
            onChangeText={v => { const n = parseInt(v, 10); if (!isNaN(n)) update({ battery: Math.min(100, Math.max(0, n)) }); }} />
          <TouchableOpacity style={styles.stepper} onPress={() => update({ battery: Math.min(100, state.battery + 5) })}>
            <Text style={styles.stepperText}>+5</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${Math.min(100, liveBat)}%` as any, backgroundColor: batColor }]} />
        </View>
      </View>

      <View style={styles.group}>
        <Text style={styles.label}>RIDE MODE</Text>
        <View style={styles.modeRow}>
          {([
            { id: 'MAX_RANGE', label: 'MAX RANGE', sub: 'eco · 1.2 %/mi' },
            { id: 'CRUISER',   label: 'CRUISER',   sub: 'moderate · 1.75 %/mi' },
            { id: 'SPORT',     label: 'SPORT',     sub: 'aggressive · 4.7 %/mi' },
            { id: 'CUSTOM',    label: 'CUSTOM',    sub: 'user-defined' },
          ] as const).map(m => (
            <TouchableOpacity key={m.id}
              style={[styles.modeBtn, state.rideMode === m.id && styles.modeBtnActive]}
              onPress={() => update({ rideMode: m.id })}>
              <Text style={[styles.modeBtnLabel, state.rideMode === m.id && styles.modeBtnLabelActive]}>
                {m.label}
              </Text>
              <Text style={[styles.modeBtnSub, state.rideMode === m.id && styles.modeBtnLabelActive]}>
                {m.sub}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.divider} />
      <CollapsibleSection title="POST-CHARGE UPDATE" defaultOpen={false}>
        <View style={styles.inlineRow}>
          <View style={styles.flex1}>
            <Text style={styles.label}>CHARGED TO %</Text>
            <TextInput style={[styles.input, chargedToError && styles.inputError]}
              keyboardType="number-pad" placeholder="e.g. 95" placeholderTextColor={C.muted}
              value={chargedToInput} onChangeText={setChargedToInput} />
          </View>
          <TouchableOpacity style={styles.actionBtn} onPress={logCharge}>
            <Text style={styles.actionBtnText}>LOG ⚡</Text>
          </TouchableOpacity>
        </View>
      </CollapsibleSection>

      <View style={styles.divider} />
      <CollapsibleSection title="MISSION LOG" defaultOpen={true}>

        {/* ── Log a new ride ───────────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>LOG MISSION</Text>
          <View style={styles.inlineRow}>
            <View style={styles.flex1}>
              <Text style={styles.label}>DISTANCE (mi)</Text>
              <TextInput style={[styles.input, rideLogError === 'dist' && styles.inputError]}
                keyboardType="decimal-pad" placeholder="0.0" placeholderTextColor={C.muted}
                value={rideDistInput} onChangeText={setRideDistInput} />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.label}>BATTERY USED %</Text>
              <TextInput style={[styles.input, rideLogError === 'bat' && styles.inputError]}
                keyboardType="decimal-pad" placeholder="0.0" placeholderTextColor={C.muted}
                value={rideBatInput} onChangeText={setRideBatInput} />
            </View>
          </View>
          <View style={styles.logModeRow}>
            {(['MAX_RANGE', 'CRUISER', 'SPORT', 'CUSTOM'] as const).map(m => (
              <TouchableOpacity key={m}
                style={[styles.logModePill, state.rideMode === m && styles.logModePillActive]}
                onPress={() => update({ rideMode: m })}>
                <Text style={[styles.logModePillText, state.rideMode === m && styles.logModePillTextActive]}>
                  {m === 'MAX_RANGE' ? 'MAX RNG' : m}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.logRideBtn} onPress={logRide}>
            <Text style={styles.logRideBtnText}>LOG MISSION</Text>
          </TouchableOpacity>
        </View>

        {displayRides.length > 0 && (
          <>
            {/* ── Draw rate by mode ──────────────────────────────────────── */}
            {modeStats.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>DRAW RATE BY MODE</Text>
                {modeStats.map(({ mode, label, avg, count }) => (
                  <View key={mode} style={styles.modeStatRow}>
                    <Text style={styles.modeStatLabel}>{label}</Text>
                    <Text style={styles.modeStatValue}>{avg.toFixed(2)}<Text style={styles.histUnit}> %/mi</Text></Text>
                    <Text style={styles.modeStatCount}>({count} ride{count !== 1 ? 's' : ''})</Text>
                  </View>
                ))}
              </View>
            )}

            {/* ── Mission history grouped by week ──────────────────────── */}
            <Text style={[styles.cardTitle, { marginTop: 4, marginBottom: 8 }]}>
              MISSION HISTORY ({state.rideLog.length} total)
            </Text>

            {weekGroups.map((group, gi) => {
              const expanded = isWeekExpanded(group.key);
              const totalDist = group.rides.reduce((s, { ride }) => s + ride.distance, 0);
              const prevMonth = gi > 0 ? weekGroups[gi - 1].month : null;
              const showMonthDivider = group.month && group.month !== prevMonth;

              return (
                <React.Fragment key={group.key}>
                  {showMonthDivider && (
                    <View style={styles.monthRow}>
                      <Text style={styles.monthText}>{group.month}</Text>
                      <View style={styles.monthLine} />
                    </View>
                  )}

                  {/* Week header row */}
                  <TouchableOpacity
                    style={[styles.weekHeader, expanded && styles.weekHeaderExpanded]}
                    onPress={() => toggleWeek(group.key, expanded)}
                    activeOpacity={0.7}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.weekLabelText}>{group.label}</Text>
                      <Text style={styles.weekMeta}>
                        {group.rides.length} ride{group.rides.length !== 1 ? 's' : ''} · {totalDist.toFixed(1)} mi
                      </Text>
                    </View>
                    <Text style={styles.weekChevron}>{expanded ? '▾' : '▸'}</Text>
                  </TouchableOpacity>

                  {/* Ride rows within this week */}
                  {expanded && (
                    <View style={styles.weekBody}>
                      <View style={styles.histHeader}>
                        <Text style={[styles.histCell, styles.histDate]}>DATE</Text>
                        <Text style={[styles.histCell, styles.histNum]}>DIST</Text>
                        <Text style={[styles.histCell, styles.histNum]}>BAT</Text>
                        <Text style={[styles.histCell, styles.histDraw]}>DRAW</Text>
                      </View>
                      {group.rides.map(({ ride }, ri) => (
                        <View key={ride.logged_at ?? ride.date}
                          style={[styles.histEntry, ri < group.rides.length - 1 && styles.histEntryBorder]}>
                          <View style={styles.histRow}>
                            <Text style={[styles.histCell, styles.histDate, styles.histValue]}>{ride.date}</Text>
                            <Text style={[styles.histCell, styles.histNum, styles.histValue]}>{ride.distance.toFixed(1)}<Text style={styles.histUnit}> mi</Text></Text>
                            <Text style={[styles.histCell, styles.histNum, styles.histValue]}>{ride.batteryUsed}<Text style={styles.histUnit}>%</Text></Text>
                            <Text style={[styles.histCell, styles.histDraw, styles.histDrawValue]}>{ride.drawRate.toFixed(2)}<Text style={styles.histUnit}> %/mi</Text></Text>
                          </View>
                          <TouchableOpacity onPress={() => openEditModal(ride)} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
                            <Text style={styles.modeBadge}>
                              {ride.rideMode ? ride.rideMode.replace('_', ' ') : '— mode'}{ride.notes ? '  · ' + ride.notes : ''} ›
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                </React.Fragment>
              );
            })}
          </>
        )}
      </CollapsibleSection>

      <View style={styles.divider} />
      <CollapsibleSection title="CHARGING TARGET" defaultOpen={false}>
        <View style={styles.inlineRow}>
          <View style={styles.flex1}>
            <Text style={styles.label}>CHARGER (A)</Text>
            <TextInput style={styles.input} keyboardType="decimal-pad" placeholder="2"
              placeholderTextColor={C.muted}
              value={state.chargerAmps === 0 ? '' : String(state.chargerAmps)}
              onChangeText={v => update({ chargerAmps: parseFloat(v) || 0 })} />
          </View>
          <View style={styles.flex1}>
            <Text style={styles.label}>TARGET %: {state.chargeTarget}</Text>
            <View style={styles.batControls}>
              <TouchableOpacity style={styles.stepper} onPress={() => update({ chargeTarget: Math.max(50, state.chargeTarget - 5) })}>
                <Text style={styles.stepperText}>−</Text>
              </TouchableOpacity>
              <TextInput style={styles.batInput} keyboardType="number-pad" value={String(state.chargeTarget)}
                onChangeText={v => { const n = parseInt(v, 10); if (!isNaN(n)) update({ chargeTarget: Math.min(100, Math.max(50, n)) }); }} />
              <TouchableOpacity style={styles.stepper} onPress={() => update({ chargeTarget: Math.min(100, state.chargeTarget + 5) })}>
                <Text style={styles.stepperText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </CollapsibleSection>

      <View style={{ height: 20 }} />

      <Modal visible={editModalVisible} transparent animationType="fade" onRequestClose={() => setEditModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>EDIT MISSION</Text>
            <Text style={styles.modalDate}>{editRideDate}</Text>

            <Text style={styles.label}>RIDE MODE</Text>
            <View style={[styles.modeRow, { marginBottom: 10 }]}>
              {(['MAX_RANGE', 'CRUISER', 'SPORT', 'CUSTOM'] as const).map(m => (
                <TouchableOpacity key={m} style={[styles.modeBtn, editMode === m && styles.modeBtnActive]}
                  onPress={() => setEditMode(m)}>
                  <Text style={[styles.modeBtnLabel, editMode === m && styles.modeBtnLabelActive]}>
                    {m === 'MAX_RANGE' ? 'MAX\nRNG' : m}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.inlineRow}>
              <View style={styles.flex1}>
                <Text style={styles.label}>DISTANCE (mi)</Text>
                <TextInput style={styles.input} keyboardType="decimal-pad"
                  value={editDist} onChangeText={setEditDist} placeholder="0.0" placeholderTextColor={C.muted} />
              </View>
              <View style={styles.flex1}>
                <Text style={styles.label}>BATTERY USED (%)</Text>
                <TextInput style={styles.input} keyboardType="decimal-pad"
                  value={editBat} onChangeText={setEditBat} placeholder="0.0" placeholderTextColor={C.muted} />
              </View>
            </View>

            <View style={styles.modalDrawRow}>
              <Text style={styles.label}>DRAW RATE</Text>
              <Text style={styles.modalDrawVal}>
                {(() => {
                  const d = parseFloat(editDist);
                  const b = parseFloat(editBat);
                  return !isNaN(d) && d > 0 && !isNaN(b) ? (b / d).toFixed(2) + ' %/mi' : '—';
                })()}
              </Text>
            </View>

            <Text style={styles.label}>NOTES</Text>
            <TextInput style={[styles.input, { minHeight: 50, textAlignVertical: 'top' }]}
              value={editNotes} onChangeText={setEditNotes}
              placeholder="optional notes" placeholderTextColor={C.muted} multiline />

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setEditModalVisible(false)}>
                <Text style={styles.modalCancelText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={saveEdit}>
                <Text style={styles.modalSaveText}>SAVE</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalDeleteDivider} />
            <TouchableOpacity style={styles.modalDelete} onPress={deleteFromModal}>
              <Text style={styles.modalDeleteText}>DELETE RIDE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
