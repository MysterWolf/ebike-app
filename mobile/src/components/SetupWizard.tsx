import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { C, MONO } from '../theme/colors';
import { AppState } from '../state/types';

interface Props {
  onComplete: (values: Partial<AppState>) => void;
}

const STEPS = [
  { title: 'Bike Identity',     sub: 'What are you riding?' },
  { title: 'Electrical Specs',  sub: 'Battery and motor configuration.' },
  { title: 'Starting Point',    sub: 'Current odometer and charger info.' },
];

function FieldLabel({ children }: { children: string }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

function Input(props: React.ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      style={styles.input}
      placeholderTextColor={C.textTer}
      autoCorrect={false}
      {...props}
    />
  );
}

export function SetupWizard({ onComplete }: Props) {
  const [step, setStep] = useState(0); // 0-indexed internally

  // Step 0 — Bike Identity
  const [make, setMake]   = useState('');
  const [year, setYear]   = useState('');

  // Step 1 — Electrical
  const [voltage, setVoltage]         = useState('');
  const [capacityAh, setCapacityAh]   = useState('');
  const [motorWatts, setMotorWatts]   = useState('');

  // Step 2 — Starting Point
  const [odometer, setOdometer]       = useState('');
  const [chargerAmps, setChargerAmps] = useState('');

  function advance() {
    if (step < STEPS.length - 1) {
      setStep(s => s + 1);
    } else {
      finish();
    }
  }

  function finish() {
    const out: Partial<AppState> = {};
    if (make.trim())                          out.make        = make.trim();
    const y = parseInt(year, 10);
    if (!isNaN(y) && y > 1900)               out.year        = y;
    const v = parseFloat(voltage);
    if (!isNaN(v) && v > 0)                  out.voltage     = v;
    const ah = parseFloat(capacityAh);
    if (!isNaN(ah) && ah > 0)                out.capacityAh  = ah;
    const mw = parseFloat(motorWatts);
    if (!isNaN(mw) && mw > 0)                out.motorWatts  = mw;
    const odo = parseFloat(odometer);
    if (!isNaN(odo) && odo >= 0)             out.odometer    = odo;
    const ca = parseFloat(chargerAmps);
    if (!isNaN(ca) && ca > 0)                out.chargerAmps = ca;
    onComplete(out);
  }

  const isLast = step === STEPS.length - 1;

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Branding ── */}
          <View style={styles.brand}>
            <Text style={styles.brandTitle}>E-BIKE</Text>
            <Text style={styles.brandSub}>MISSION CONTROL</Text>
          </View>

          {/* ── Progress dots ── */}
          <View style={styles.dotsRow}>
            {STEPS.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === step  && styles.dotActive,
                  i < step    && styles.dotDone,
                ]}
              />
            ))}
          </View>
          <Text style={styles.stepCounter}>STEP {step + 1} OF {STEPS.length}</Text>

          {/* ── Step header ── */}
          <View style={styles.stepHeader}>
            <Text style={styles.stepTitle}>{STEPS[step].title}</Text>
            <Text style={styles.stepSub}>{STEPS[step].sub}</Text>
          </View>

          {/* ── Step 0: Bike Identity ── */}
          {step === 0 && (
            <View style={styles.fields}>
              <View style={styles.fieldGroup}>
                <FieldLabel>MAKE / MODEL</FieldLabel>
                <Input
                  value={make}
                  onChangeText={setMake}
                  placeholder="e.g. Movcan V70"
                  returnKeyType="next"
                />
              </View>
              <View style={styles.fieldGroup}>
                <FieldLabel>YEAR</FieldLabel>
                <Input
                  value={year}
                  onChangeText={setYear}
                  placeholder="e.g. 2024"
                  keyboardType="number-pad"
                  returnKeyType="done"
                />
              </View>
            </View>
          )}

          {/* ── Step 1: Electrical ── */}
          {step === 1 && (
            <View style={styles.fields}>
              <View style={styles.row}>
                <View style={styles.flex1}>
                  <FieldLabel>VOLTAGE (V)</FieldLabel>
                  <Input
                    value={voltage}
                    onChangeText={setVoltage}
                    placeholder="e.g. 52"
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.flex1}>
                  <FieldLabel>CAPACITY (Ah)</FieldLabel>
                  <Input
                    value={capacityAh}
                    onChangeText={setCapacityAh}
                    placeholder="e.g. 20"
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>
              <View style={styles.fieldGroup}>
                <FieldLabel>MOTOR WATTAGE (W)</FieldLabel>
                <Input
                  value={motorWatts}
                  onChangeText={setMotorWatts}
                  placeholder="e.g. 750"
                  keyboardType="number-pad"
                  returnKeyType="done"
                />
              </View>
            </View>
          )}

          {/* ── Step 2: Starting Point ── */}
          {step === 2 && (
            <View style={styles.fields}>
              <View style={styles.fieldGroup}>
                <FieldLabel>CURRENT ODOMETER (mi)</FieldLabel>
                <Input
                  value={odometer}
                  onChangeText={setOdometer}
                  placeholder="e.g. 0 for a new bike"
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.fieldGroup}>
                <FieldLabel>CHARGER OUTPUT (A)</FieldLabel>
                <Input
                  value={chargerAmps}
                  onChangeText={setChargerAmps}
                  placeholder="e.g. 2"
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                />
              </View>
              <View style={styles.hint}>
                <Text style={styles.hintText}>
                  All fields can be updated anytime in the BIKE and RIDE tabs.
                </Text>
              </View>
            </View>
          )}

          {/* ── Actions ── */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.skipBtn} onPress={advance} activeOpacity={0.7}>
              <Text style={styles.skipBtnText}>Skip</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.nextBtn} onPress={advance} activeOpacity={0.8}>
              <Text style={styles.nextBtnText}>{isLast ? 'FINISH' : 'NEXT →'}</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:  { flex: 1, backgroundColor: C.bg },
  flex:  { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 40,
  },

  brand: { alignItems: 'center', marginBottom: 28 },
  brandTitle: {
    fontFamily: MONO,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 4,
    color: C.accent,
  },
  brandSub: {
    fontFamily: MONO,
    fontSize: 10,
    letterSpacing: 3,
    color: C.textSec,
    marginTop: 2,
  },

  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 8 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.border,
  },
  dotActive: { backgroundColor: C.accent, width: 24 },
  dotDone:   { backgroundColor: C.accentDim },

  stepCounter: {
    fontFamily: MONO,
    fontSize: 8,
    letterSpacing: 2,
    color: C.textTer,
    textAlign: 'center',
    marginBottom: 32,
  },

  stepHeader: { marginBottom: 24 },
  stepTitle: {
    fontFamily: MONO,
    fontSize: 20,
    fontWeight: '700',
    color: C.text,
    marginBottom: 6,
  },
  stepSub: {
    fontFamily: MONO,
    fontSize: 11,
    color: C.textSec,
    lineHeight: 17,
  },

  fields: { marginBottom: 8 },
  row: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  flex1: { flex: 1 },
  fieldGroup: { marginBottom: 16 },
  fieldLabel: {
    fontFamily: MONO,
    fontSize: 9,
    letterSpacing: 1,
    color: C.textSec,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  input: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: MONO,
    fontSize: 14,
    color: C.text,
  },

  hint: {
    backgroundColor: C.accentBg,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4,
  },
  hintText: {
    fontFamily: MONO,
    fontSize: 10,
    color: C.accent,
    lineHeight: 15,
  },

  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
    gap: 12,
  },
  skipBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  skipBtnText: {
    fontFamily: MONO,
    fontSize: 13,
    color: C.textSec,
  },
  nextBtn: {
    flex: 1,
    backgroundColor: C.accent,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  nextBtnText: {
    fontFamily: MONO,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: C.white,
  },
});
