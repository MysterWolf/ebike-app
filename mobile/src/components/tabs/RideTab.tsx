import React, { useRef, useState } from 'react';
import {
  Alert,
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

  const batColor = state.battery < 20 ? C.red : state.battery < 35 ? C.amber : C.accent;

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

    const entry: RideLogEntry = { distance: dist, batteryUsed: bat, drawRate, date };
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

  function deleteRide(origIdx: number) {
    const removed = state.rideLog[origIdx];
    Alert.alert(
      'Remove Entry',
      'Delete this mission from the log?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const newLog = state.rideLog.filter((_, i) => i !== origIdx);
            const newOdometer = Math.max(0, Math.round((state.odometer - removed.distance) * 10) / 10);
            update({ rideLog: newLog, odometer: newOdometer });
          },
        },
      ],
    );
  }

  const displayRides = (state.rideLog ?? [])
    .map((ride, origIdx) => ({ ride, origIdx }))
    .reverse();

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
          <Label>BATTERY %</Label>
          <Text style={[styles.batValue, { color: batColor }]}>{state.battery}%</Text>
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
        <BatteryBar pct={state.battery} />
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
            style={[styles.modeBtn, state.rideMode === 'HARD' && styles.modeBtnActive]}
            onPress={() => update({ rideMode: 'HARD' })}
          >
            <Text style={[styles.modeBtnLabel, state.rideMode === 'HARD' && styles.modeBtnLabelActive]}>
              HARD
            </Text>
            <Text style={[styles.modeBtnSub, state.rideMode === 'HARD' && styles.modeBtnLabelActive]}>
              aggressive · 4.7 %/mi
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
        <TouchableOpacity style={styles.logRideBtn} onPress={logRide}>
          <Text style={styles.logRideBtnText}>LOG MISSION</Text>
        </TouchableOpacity>
      </View>

      {displayRides.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>MISSION HISTORY ({state.rideLog.length} total)</Text>
          <View style={styles.histHeader}>
            <Text style={[styles.histCell, styles.histDate]}>DATE</Text>
            <Text style={[styles.histCell, styles.histNum]}>DIST</Text>
            <Text style={[styles.histCell, styles.histNum]}>BAT</Text>
            <Text style={[styles.histCell, styles.histDraw]}>DRAW</Text>
            <View style={styles.histDelCol} />
          </View>
          {displayRides.map(({ ride, origIdx }, i) => (
            <View key={origIdx} style={[styles.histRow, i < displayRides.length - 1 && styles.histRowBorder]}>
              <Text style={[styles.histCell, styles.histDate, styles.histValue]}>{ride.date}</Text>
              <Text style={[styles.histCell, styles.histNum, styles.histValue]}>{ride.distance.toFixed(1)}<Text style={styles.histUnit}> mi</Text></Text>
              <Text style={[styles.histCell, styles.histNum, styles.histValue]}>{ride.batteryUsed}<Text style={styles.histUnit}>%</Text></Text>
              <Text style={[styles.histCell, styles.histDraw, styles.histDrawValue]}>{ride.drawRate.toFixed(2)}<Text style={styles.histUnit}> %/mi</Text></Text>
              <TouchableOpacity
                style={styles.histDelCol}
                onPress={() => deleteRide(origIdx)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.histDel}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

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
  histRow: { flexDirection: 'row', paddingVertical: 5 },
  histRowBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  histCell: { fontFamily: MONO, fontSize: 8, color: C.textSec, letterSpacing: 0.5 },
  histDate: { flex: 2.2 },
  histNum: { flex: 1, textAlign: 'right' },
  histDraw: { flex: 1.4, textAlign: 'right' },
  histValue: { fontSize: 11, color: C.text },
  histDrawValue: { fontSize: 11, color: C.accent, fontWeight: '700' },
  histUnit: { fontSize: 9, color: C.textSec, fontWeight: '400' },
  histDelCol: { width: 24, alignItems: 'center', justifyContent: 'center' },
  histDel: { fontFamily: MONO, fontSize: 12, color: C.red },
});
