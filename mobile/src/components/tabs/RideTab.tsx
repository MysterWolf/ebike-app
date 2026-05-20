import React, { useRef, useState } from 'react';
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
import { C, MONO } from '../../theme/colors';
import { AppState, ChargeLogEntry, RideLogEntry } from '../../state/types';
import { nowTime } from '../../utils/ai';
import { useBleContext } from '../../context/BleContext';

interface Props {
  state: AppState;
  update: (u: Partial<AppState>) => void;
  onSysMsg: (content: string) => void;
}

function SectionTitle({ label }: { label: string }) {
  return <Text style={styles.section}>{label}</Text>;
}

function Label({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

function InputField(props: React.ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      style={styles.input}
      placeholderTextColor={C.textTer}
      {...props}
    />
  );
}

function BatteryBar({ pct }: { pct: number }) {
  const color = pct < 20 ? C.red : pct < 35 ? C.amber : C.accent;
  return (
    <View style={styles.barTrack}>
      <View style={[styles.barFill, { width: `${Math.min(100, pct)}%` as any, backgroundColor: color }]} />
    </View>
  );
}

export function RideTab({ state, update, onSysMsg }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const [chargedToInput, setChargedToInput] = useState('');
  const [chargedToError, setChargedToError] = useState(false);
  const [rideDistInput, setRideDistInput] = useState('');
  const [rideBatInput, setRideBatInput] = useState('');
  const [rideLogError, setRideLogError] = useState<'dist' | 'bat' | null>(null);

  // Edit modal state (Bug 1)
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editRideDate, setEditRideDate] = useState('');
  const [editDist, setEditDist] = useState('');
  const [editBat, setEditBat] = useState('');
  const [editMode, setEditMode] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // Live battery from BLE when connected (Bug 3)
  const { status, telemetry } = useBleContext();
  const liveBat = status === 'connected' && telemetry?.battery_pct != null
    ? telemetry.battery_pct
    : state.battery;

  const batColor = liveBat < 20 ? C.red : liveBat < 35 ? C.amber : C.accent;

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
      now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
      ' ' +
      now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    const entry: ChargeLogEntry = { pct: rounded, time: timeStr };
    update({ chargeLog: [...state.chargeLog, entry], battery: rounded });
    setChargedToInput('');
    onSysMsg(`⚡ Calibration event logged — charged to ${rounded}% at ${timeStr}. Hard surface, away from exits.`);
  }

  function logRide() {
    const dist = parseFloat(rideDistInput);
    const bat = parseFloat(rideBatInput);

    if (isNaN(dist) || dist <= 0) {
      setRideLogError('dist');
      setTimeout(() => setRideLogError(null), 1400);
      return;
    }
    if (isNaN(bat) || bat <= 0 || bat > 100) {
      setRideLogError('bat');
      setTimeout(() => setRideLogError(null), 1400);
      return;
    }

    const drawRate = bat / dist;
    const now = new Date();
    const date =
      now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
      ', ' +
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

  // Bug 1 — proper edit modal
  function openEditModal(origIdx: number) {
    const ride = state.rideLog[origIdx];
    if (!ride) return;
    setEditRideDate(ride.date);
    setEditDist(String(ride.distance));
    setEditBat(String(ride.batteryUsed));
    setEditMode(ride.rideMode ?? 'CRUISER');
    setEditNotes(ride.notes ?? '');
    setEditModalVisible(true);
  }

  function saveEdit() {
    const dist = parseFloat(editDist);
    const bat = parseFloat(editBat);
    if (isNaN(dist) || dist <= 0 || isNaN(bat) || bat < 0 || bat > 100) return;
    const drawRate = dist > 0 ? bat / dist : 0;
    const newLog = state.rideLog.map(r =>
      r.date === editRideDate
        ? { ...r, distance: Math.round(dist * 10) / 10, batteryUsed: Math.round(bat * 10) / 10, drawRate: Math.round(drawRate * 100) / 100, rideMode: editMode, notes: editNotes.trim() || undefined }
        : r
    );
    update({ rideLog: newLog });
    setEditModalVisible(false);
  }

  function closeEdit() {
    setEditModalVisible(false);
  }

  function deleteFromModal() {
    Alert.alert(
      'Delete Ride',
      'Delete this ride? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const removed = state.rideLog.find(r => r.date === editRideDate);
            const newLog = state.rideLog.filter(r => r.date !== editRideDate);
            const newOdometer = removed
              ? Math.max(0, Math.round((state.odometer - removed.distance) * 10) / 10)
              : state.odometer;
            const newBattery = removed
              ? Math.min(100, Math.round((state.battery + removed.batteryUsed) * 10) / 10)
              : state.battery;
            update({ rideLog: newLog, odometer: newOdometer, battery: newBattery });
            setEditModalVisible(false);
          },
        },
      ],
    );
  }

  const displayRides = (state.rideLog ?? [])
    .map((ride, origIdx) => ({ ride, origIdx }))
    .sort((a, b) => {
      const ta = a.ride.logged_at ?? a.ride.date;
      const tb = b.ride.logged_at ?? b.ride.date;
      return tb > ta ? 1 : -1;
    });

  return (
    <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.content}>
      <SectionTitle label="LIVE TELEMETRY" />

      <View style={styles.group}>
        <Label>ODOMETER (mi)</Label>
        <InputField
          keyboardType="decimal-pad"
          value={state.odometer === 0 ? '' : String(state.odometer)}
          placeholder="0.0"
          onChangeText={v => update({ odometer: parseFloat(v) || 0 })}
        />
      </View>

      <View style={styles.group}>
        <View style={styles.row}>
          <Label>BATTERY %{status === 'connected' ? '  ⚡ LIVE' : ''}</Label>
          <Text style={[styles.batValue, { color: batColor }]}>{liveBat.toFixed(0)}%</Text>
        </View>
        <View style={styles.batControls}>
          <TouchableOpacity
            style={styles.stepper}
            onPress={() => update({ battery: Math.max(0, state.battery - 5) })}
          >
            <Text style={styles.stepperText}>−5</Text>
          </TouchableOpacity>
          <TextInput
            style={styles.batInput}
            keyboardType="number-pad"
            value={String(state.battery)}
            onChangeText={v => {
              const n = parseInt(v, 10);
              if (!isNaN(n)) update({ battery: Math.min(100, Math.max(0, n)) });
            }}
          />
          <TouchableOpacity
            style={styles.stepper}
            onPress={() => update({ battery: Math.min(100, state.battery + 5) })}
          >
            <Text style={styles.stepperText}>+5</Text>
          </TouchableOpacity>
        </View>
        <BatteryBar pct={liveBat} />
      </View>

      <View style={styles.group}>
        <Label>RIDE MODE</Label>
        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[styles.modeBtn, state.rideMode === 'MAX_RANGE' && styles.modeBtnActive]}
            onPress={() => update({ rideMode: 'MAX_RANGE' })}
          >
            <Text style={[styles.modeBtnLabel, state.rideMode === 'MAX_RANGE' && styles.modeBtnLabelActive]}>
              MAX RANGE
            </Text>
            <Text style={[styles.modeBtnSub, state.rideMode === 'MAX_RANGE' && styles.modeBtnLabelActive]}>
              eco · 1.2 %/mi
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, state.rideMode === 'CRUISER' && styles.modeBtnActive]}
            onPress={() => update({ rideMode: 'CRUISER' })}
          >
            <Text style={[styles.modeBtnLabel, state.rideMode === 'CRUISER' && styles.modeBtnLabelActive]}>
              CRUISER
            </Text>
            <Text style={[styles.modeBtnSub, state.rideMode === 'CRUISER' && styles.modeBtnLabelActive]}>
              moderate · 1.75 %/mi
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, state.rideMode === 'SPORT' && styles.modeBtnActive]}
            onPress={() => update({ rideMode: 'SPORT' })}
          >
            <Text style={[styles.modeBtnLabel, state.rideMode === 'SPORT' && styles.modeBtnLabelActive]}>
              SPORT
            </Text>
            <Text style={[styles.modeBtnSub, state.rideMode === 'SPORT' && styles.modeBtnLabelActive]}>
              aggressive · 4.7 %/mi
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, state.rideMode === 'CUSTOM' && styles.modeBtnActive]}
            onPress={() => update({ rideMode: 'CUSTOM' })}
          >
            <Text style={[styles.modeBtnLabel, state.rideMode === 'CUSTOM' && styles.modeBtnLabelActive]}>
              CUSTOM
            </Text>
            <Text style={[styles.modeBtnSub, state.rideMode === 'CUSTOM' && styles.modeBtnLabelActive]}>
              user-defined
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.divider} />
      <CollapsibleSection title="POST-CHARGE UPDATE" defaultOpen={false}>
      <View style={styles.inlineRow}>
        <View style={styles.flex1}>
          <Label>CHARGED TO %</Label>
          <InputField
            keyboardType="number-pad"
            placeholder="e.g. 95"
            value={chargedToInput}
            onChangeText={setChargedToInput}
            style={[styles.input, chargedToError && styles.inputError]}
          />
        </View>
        <TouchableOpacity style={styles.actionBtn} onPress={logCharge}>
          <Text style={styles.actionBtnText}>LOG ⚡</Text>
        </TouchableOpacity>
      </View>
      </CollapsibleSection>

      <View style={styles.divider} />
      <CollapsibleSection title="MISSION LOG" defaultOpen={true}>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>LOG MISSION</Text>
        <View style={styles.inlineRow}>
          <View style={styles.flex1}>
            <Label>DISTANCE (mi)</Label>
            <InputField
              keyboardType="decimal-pad"
              placeholder="0.0"
              value={rideDistInput}
              onChangeText={setRideDistInput}
              style={[styles.input, rideLogError === 'dist' && styles.inputError]}
            />
          </View>
          <View style={styles.flex1}>
            <Label>BATTERY USED %</Label>
            <InputField
              keyboardType="decimal-pad"
              placeholder="0.0"
              value={rideBatInput}
              onChangeText={setRideBatInput}
              style={[styles.input, rideLogError === 'bat' && styles.inputError]}
            />
          </View>
        </View>
        <View style={styles.logModeRow}>
          {(['MAX_RANGE', 'CRUISER', 'SPORT', 'CUSTOM'] as const).map(m => (
            <TouchableOpacity
              key={m}
              style={[styles.logModePill, state.rideMode === m && styles.logModePillActive]}
              onPress={() => update({ rideMode: m })}
            >
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

      {displayRides.length > 0 && (() => {
        const MODE_LABELS: Record<string, string> = {
          MAX_RANGE: 'MAX RANGE',
          CRUISER:   'CRUISER',
          SPORT:     'SPORT',
          HARD:      'SPORT',   // legacy entries
          CUSTOM:    'CUSTOM',
        };
        const ORDER = ['MAX_RANGE', 'CRUISER', 'SPORT', 'HARD', 'CUSTOM'];
        const buckets: Record<string, number[]> = {};
        for (const { ride } of displayRides) {
          const key = ride.rideMode ?? 'UNKNOWN';
          if (!buckets[key]) buckets[key] = [];
          buckets[key].push(ride.drawRate);
        }
        // Merge HARD into SPORT bucket for display
        if (buckets['HARD']) {
          buckets['SPORT'] = [...(buckets['SPORT'] ?? []), ...buckets['HARD']];
          delete buckets['HARD'];
        }
        const displayModes = [...ORDER.filter(m => m !== 'HARD' && buckets[m]), ...Object.keys(buckets).filter(k => !ORDER.includes(k))];

        return (
          <>
            {displayModes.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>DRAW RATE BY MODE</Text>
                {displayModes.map(mode => {
                  const rates = buckets[mode];
                  const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
                  const label = MODE_LABELS[mode] ?? mode;
                  return (
                    <View key={mode} style={styles.modeStatRow}>
                      <Text style={styles.modeStatLabel}>{label}</Text>
                      <Text style={styles.modeStatValue}>{avg.toFixed(2)}<Text style={styles.histUnit}> %/mi</Text></Text>
                      <Text style={styles.modeStatCount}>({rates.length} ride{rates.length !== 1 ? 's' : ''})</Text>
                    </View>
                  );
                })}
              </View>
            )}

            <View style={styles.card}>
          <Text style={styles.cardTitle}>MISSION HISTORY ({state.rideLog.length} total)</Text>
          <View style={styles.histHeader}>
            <Text style={[styles.histCell, styles.histDate]}>DATE</Text>
            <Text style={[styles.histCell, styles.histNum]}>DIST</Text>
            <Text style={[styles.histCell, styles.histNum]}>BAT</Text>
            <Text style={[styles.histCell, styles.histDraw]}>DRAW</Text>
          </View>
          {displayRides.map(({ ride, origIdx }, i) => (
            <View key={origIdx} style={[styles.histEntry, i < displayRides.length - 1 && styles.histEntryBorder]}>
              <View style={styles.histRow}>
                <Text style={[styles.histCell, styles.histDate, styles.histValue]}>{ride.date}</Text>
                <Text style={[styles.histCell, styles.histNum, styles.histValue]}>{ride.distance.toFixed(1)}<Text style={styles.histUnit}> mi</Text></Text>
                <Text style={[styles.histCell, styles.histNum, styles.histValue]}>{ride.batteryUsed}<Text style={styles.histUnit}>%</Text></Text>
                <Text style={[styles.histCell, styles.histDraw, styles.histDrawValue]}>{ride.drawRate.toFixed(2)}<Text style={styles.histUnit}> %/mi</Text></Text>
              </View>
              <TouchableOpacity
                onPress={() => openEditModal(origIdx)}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                <Text style={styles.modeBadge}>
                  {ride.rideMode ? ride.rideMode.replace('_', ' ') : '— mode'}{ride.notes ? '  · ' + ride.notes : ''} ›
                </Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
          </>
        );
      })()}

      </CollapsibleSection>

      <View style={styles.divider} />
      <CollapsibleSection title="CHARGING TARGET" defaultOpen={false}>

      <View style={styles.inlineRow}>
        <View style={styles.flex1}>
          <Label>CHARGER (A)</Label>
          <InputField
            keyboardType="decimal-pad"
            placeholder="2"
            value={state.chargerAmps === 0 ? '' : String(state.chargerAmps)}
            onChangeText={v => update({ chargerAmps: parseFloat(v) || 0 })}
          />
        </View>
        <View style={styles.flex1}>
          <Label>TARGET %: {state.chargeTarget}</Label>
          <View style={styles.batControls}>
            <TouchableOpacity
              style={styles.stepper}
              onPress={() => update({ chargeTarget: Math.max(50, state.chargeTarget - 5) })}
            >
              <Text style={styles.stepperText}>−</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.batInput}
              keyboardType="number-pad"
              value={String(state.chargeTarget)}
              onChangeText={v => {
                const n = parseInt(v, 10);
                if (!isNaN(n)) update({ chargeTarget: Math.min(100, Math.max(50, n)) });
              }}
            />
            <TouchableOpacity
              style={styles.stepper}
              onPress={() => update({ chargeTarget: Math.min(100, state.chargeTarget + 5) })}
            >
              <Text style={styles.stepperText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      </CollapsibleSection>

      <View style={{ height: 20 }} />

      {/* Bug 1 — Edit Mission Modal */}
      <Modal visible={editModalVisible} transparent animationType="fade" onRequestClose={closeEdit}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>EDIT MISSION</Text>
            <Text style={styles.modalDate}>{editRideDate}</Text>

            <Label>RIDE MODE</Label>
            <View style={[styles.modeRow, { marginBottom: 10 }]}>
              {(['MAX_RANGE', 'CRUISER', 'SPORT', 'CUSTOM'] as const).map(m => (
                <TouchableOpacity
                  key={m}
                  style={[styles.modeBtn, editMode === m && styles.modeBtnActive]}
                  onPress={() => setEditMode(m)}
                >
                  <Text style={[styles.modeBtnLabel, editMode === m && styles.modeBtnLabelActive]}>
                    {m === 'MAX_RANGE' ? 'MAX\nRNG' : m}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.inlineRow}>
              <View style={styles.flex1}>
                <Label>DISTANCE (mi)</Label>
                <InputField
                  keyboardType="decimal-pad"
                  value={editDist}
                  onChangeText={setEditDist}
                  placeholder="0.0"
                />
              </View>
              <View style={styles.flex1}>
                <Label>BATTERY USED (%)</Label>
                <InputField
                  keyboardType="decimal-pad"
                  value={editBat}
                  onChangeText={setEditBat}
                  placeholder="0.0"
                />
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

            <Label>NOTES</Label>
            <InputField
              value={editNotes}
              onChangeText={setEditNotes}
              placeholder="optional notes"
              multiline
              style={[styles.input, { minHeight: 50, textAlignVertical: 'top' }]}
            />

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancel} onPress={closeEdit}>
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

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: C.bg },
  content: { padding: 12 },
  section: {
    fontFamily: MONO,
    fontSize: 8,
    letterSpacing: 2,
    color: C.accent,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 2,
  },
  group: { marginBottom: 10 },
  label: {
    fontFamily: MONO,
    fontSize: 9,
    color: C.textSec,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  input: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontFamily: MONO,
    fontSize: 13,
    color: C.text,
  },
  inputError: { borderColor: C.red },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  batValue: { fontFamily: MONO, fontSize: 16, fontWeight: '700' },
  batControls: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  stepper: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  stepperText: { fontFamily: MONO, fontSize: 12, color: C.textSec },
  batInput: {
    flex: 1,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontFamily: MONO,
    fontSize: 13,
    color: C.text,
    textAlign: 'center',
  },
  barTrack: { height: 5, backgroundColor: C.border, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 5, borderRadius: 3 },
  modeRow: { flexDirection: 'row', gap: 8 },
  modeBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: C.surface,
  },
  modeBtnActive: { backgroundColor: C.accent, borderColor: C.accent },
  modeBtnLabel: { fontFamily: MONO, fontSize: 11, fontWeight: '700', color: C.textSec, letterSpacing: 1 },
  modeBtnSub: { fontFamily: MONO, fontSize: 9, color: C.textTer, marginTop: 2 },
  modeBtnLabelActive: { color: C.white },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 10 },
  card: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    padding: 10,
    marginBottom: 10,
  },
  cardTitle: {
    fontFamily: MONO,
    fontSize: 8,
    color: C.textSec,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  flex1: { flex: 1 },
  inlineRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end', marginBottom: 10 },
  actionBtn: {
    backgroundColor: C.accent,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignSelf: 'flex-end',
  },
  actionBtnText: { fontFamily: MONO, fontSize: 11, fontWeight: '700', color: C.white, letterSpacing: 1 },
  logModeRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  logModePill: { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 4,
    paddingVertical: 6, alignItems: 'center', backgroundColor: C.bg },
  logModePillActive: { backgroundColor: C.accent, borderColor: C.accent },
  logModePillText: { fontFamily: MONO, fontSize: 9, fontWeight: '700',
    color: C.textSec, letterSpacing: 0.5 },
  logModePillTextActive: { color: C.white },
  logRideBtn: {
    backgroundColor: C.accent,
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 2,
  },
  logRideBtnText: { fontFamily: MONO, fontSize: 12, fontWeight: '700', color: C.white, letterSpacing: 1.5 },
  histHeader: {
    flexDirection: 'row',
    paddingBottom: 5,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    marginBottom: 4,
  },
  histEntry: { paddingVertical: 5 },
  histEntryBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  histRow: { flexDirection: 'row' },
  modeBadge: { fontFamily: MONO, fontSize: 9, color: C.textTer, letterSpacing: 0.5,
    marginTop: 3, marginBottom: 1 },
  histCell: { fontFamily: MONO, fontSize: 8, color: C.textSec, letterSpacing: 0.5 },
  histDate: { flex: 2.2 },
  histNum: { flex: 1, textAlign: 'right' },
  histDraw: { flex: 1.4, textAlign: 'right' },
  histValue: { fontSize: 11, color: C.text },
  histDrawValue: { fontSize: 11, color: C.accent, fontWeight: '700' },
  histUnit: { fontSize: 9, color: C.textSec, fontWeight: '400' },
  modeStatRow: { flexDirection: 'row', alignItems: 'baseline', paddingVertical: 4,
    borderBottomWidth: 1, borderBottomColor: C.border },
  modeStatLabel: { fontFamily: MONO, fontSize: 10, color: C.textSec, letterSpacing: 0.5, width: 80 },
  modeStatValue: { fontFamily: MONO, fontSize: 13, color: C.accent, fontWeight: '700', flex: 1 },
  modeStatCount: { fontFamily: MONO, fontSize: 9, color: C.textTer },
  // Edit modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    padding: 16,
  },
  modalTitle: {
    fontFamily: MONO,
    fontSize: 10,
    fontWeight: '700',
    color: C.accent,
    letterSpacing: 2,
    marginBottom: 2,
  },
  modalDate: {
    fontFamily: MONO,
    fontSize: 10,
    color: C.textTer,
    marginBottom: 12,
  },
  modalDrawRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalDrawVal: {
    fontFamily: MONO,
    fontSize: 13,
    color: C.accent,
    fontWeight: '700',
  },
  modalBtns: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  modalCancel: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
  },
  modalCancelText: {
    fontFamily: MONO,
    fontSize: 11,
    color: C.textSec,
    letterSpacing: 1,
  },
  modalSave: {
    flex: 1,
    backgroundColor: C.accent,
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
  },
  modalSaveText: {
    fontFamily: MONO,
    fontSize: 11,
    fontWeight: '700',
    color: C.white,
    letterSpacing: 1,
  },
  modalDeleteDivider: {
    height: 1,
    backgroundColor: C.border,
    marginTop: 14,
    marginBottom: 10,
  },
  modalDelete: {
    borderWidth: 1,
    borderColor: C.red,
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
  },
  modalDeleteText: {
    fontFamily: MONO,
    fontSize: 11,
    fontWeight: '700',
    color: C.red,
    letterSpacing: 1,
  },
});
