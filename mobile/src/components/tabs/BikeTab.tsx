import React from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet } from 'react-native';
import { CollapsibleSection } from '../CollapsibleSection';
import { C, MONO } from '../../theme/colors';
import { AppState } from '../../state/types';

interface Props {
  state: AppState;
  update: (u: Partial<AppState>) => void;
}

function SectionTitle({ label }: { label: string }) {
  return <Text style={styles.section}>{label}</Text>;
}

function Label({ children }: { children: string }) {
  return <Text style={styles.label}>{children}</Text>;
}

function Field({
  label,
  value,
  onChangeText,
  keyboardType = 'default',
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: React.ComponentProps<typeof TextInput>['keyboardType'];
  placeholder?: string;
}) {
  return (
    <View style={styles.group}>
      <Label>{label}</Label>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor={C.textTer}
      />
    </View>
  );
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.specRow}>
      <Text style={styles.specKey}>{label}</Text>
      <Text style={styles.specVal}>{value}</Text>
    </View>
  );
}

export function BikeTab({ state, update }: Props) {
  const wh = state.voltage * state.capacityAh;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <SectionTitle label="IDENTITY" />

      <View style={styles.inlineRow}>
        <View style={[styles.group, styles.flex2]}>
          <Label>MAKE / MODEL</Label>
          <TextInput
            style={styles.input}
            value={state.make}
            onChangeText={v => update({ make: v })}
            placeholderTextColor={C.textTer}
          />
        </View>
        <View style={[styles.group, styles.flex1]}>
          <Label>YEAR</Label>
          <TextInput
            style={styles.input}
            value={String(state.year)}
            onChangeText={v => update({ year: parseInt(v, 10) || state.year })}
            keyboardType="number-pad"
            placeholderTextColor={C.textTer}
          />
        </View>
      </View>

      <View style={styles.divider} />
      <SectionTitle label="ELECTRICAL" />

      <View style={styles.inlineRow}>
        <Field
          label="VOLTAGE (V)"
          value={String(state.voltage)}
          onChangeText={v => update({ voltage: parseFloat(v) || 0 })}
          keyboardType="decimal-pad"
        />
        <Field
          label="CAPACITY (Ah)"
          value={String(state.capacityAh)}
          onChangeText={v => update({ capacityAh: parseFloat(v) || 0 })}
          keyboardType="decimal-pad"
        />
        <Field
          label="MOTOR (W)"
          value={String(state.motorWatts)}
          onChangeText={v => update({ motorWatts: parseFloat(v) || 0 })}
          keyboardType="number-pad"
        />
      </View>

      <View style={styles.divider} />
      <SectionTitle label="PHYSICAL" />

      <View style={styles.inlineRow}>
        <Field
          label="WEIGHT (lbs)"
          value={String(state.weightLbs)}
          onChangeText={v => update({ weightLbs: parseFloat(v) || 0 })}
          keyboardType="decimal-pad"
        />
        <Field
          label="TOP SPEED (mph)"
          value={String(state.topSpeed)}
          onChangeText={v => update({ topSpeed: parseFloat(v) || 0 })}
          keyboardType="decimal-pad"
        />
      </View>

      <View style={styles.group}>
        <View style={styles.labelRow}>
          <Label>TIRE SIZE</Label>
          {state.tireSizeFromMod && (
            <Text style={styles.modBadge}>from mod log</Text>
          )}
        </View>
        <TextInput
          style={styles.input}
          value={state.tireSize}
          onChangeText={v => update({ tireSize: v, tireSizeFromMod: false })}
          placeholderTextColor={C.textTer}
        />
      </View>

      <View style={styles.divider} />
      <CollapsibleSection title="SPECS SUMMARY" defaultOpen={false}>
      <View style={styles.card}>
        <SpecRow label="Model" value={`${state.make} (${state.year})`} />
        <SpecRow label="Voltage" value={`${state.voltage}V`} />
        <SpecRow label="Capacity" value={`${state.capacityAh}Ah`} />
        <SpecRow label="Total Energy" value={`${wh}Wh`} />
        <SpecRow label="Motor" value={`${state.motorWatts}W`} />
        <SpecRow label="Weight" value={`${state.weightLbs} lbs`} />
        <SpecRow label="Tires" value={state.tireSize} />
        <SpecRow label="Top Speed" value={`${state.topSpeed} mph`} />
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
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  modBadge: {
    fontFamily: MONO,
    fontSize: 8,
    color: C.accent,
    letterSpacing: 0.5,
    backgroundColor: C.accentBg,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
    overflow: 'hidden',
  },
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
    fontSize: 12,
    color: C.text,
  },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 10 },
  inlineRow: { flexDirection: 'row', gap: 8 },
  flex1: { flex: 1 },
  flex2: { flex: 2 },
  card: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    padding: 10,
  },
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  specKey: { fontFamily: MONO, fontSize: 10, color: C.textSec },
  specVal: { fontFamily: MONO, fontSize: 10, color: C.text, fontWeight: '600' },
});
