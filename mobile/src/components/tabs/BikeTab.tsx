import React, { useMemo } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet } from 'react-native';
import { CollapsibleSection } from '../CollapsibleSection';
import { useTheme } from '../../theme/ThemeContext';
import { MONO } from '../../theme/colors';
import { AppState } from '../../state/types';

interface Props {
  state: AppState;
  update: (u: Partial<AppState>) => void;
}

export function BikeTab({ state, update }: Props) {
  const { C } = useTheme();
  const wh = state.voltage * state.capacityAh;

  const styles = useMemo(() => StyleSheet.create({
    scroll:   { flex: 1, backgroundColor: C.background },
    content:  { padding: 12 },
    section:  {
      fontFamily: MONO, fontSize: 8, letterSpacing: 2, color: C.accent,
      textTransform: 'uppercase', marginBottom: 8, marginTop: 2,
    },
    group:    { marginBottom: 10 },
    labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
    modBadge: {
      fontFamily: MONO, fontSize: 8, color: C.accent, letterSpacing: 0.5,
      backgroundColor: C.accentTint,
      paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3, overflow: 'hidden',
    },
    label: { fontFamily: MONO, fontSize: 9, color: C.inkMid, letterSpacing: 0.5, marginBottom: 4 },
    input: {
      backgroundColor: C.white,
      borderWidth: 1, borderColor: C.border, borderRadius: 6,
      paddingHorizontal: 10, paddingVertical: 7,
      fontFamily: MONO, fontSize: 12, color: C.ink,
    },
    divider: { height: 1, backgroundColor: C.border, marginVertical: 10 },
    inlineRow: { flexDirection: 'row', gap: 8 },
    flex1: { flex: 1 },
    flex2: { flex: 2 },
    card: {
      backgroundColor: C.white,
      borderWidth: 1, borderColor: C.border, borderRadius: 6, padding: 10,
    },
    specRow: {
      flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5,
      borderBottomWidth: 1, borderBottomColor: C.border,
    },
    specKey: { fontFamily: MONO, fontSize: 10, color: C.inkMid },
    specVal: { fontFamily: MONO, fontSize: 10, color: C.ink, fontWeight: '600' },
  }), [C]);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.section}>IDENTITY</Text>

      <View style={styles.inlineRow}>
        <View style={[styles.group, styles.flex2]}>
          <Text style={styles.label}>MAKE / MODEL</Text>
          <TextInput style={styles.input} value={state.make}
            onChangeText={v => update({ make: v })} placeholderTextColor={C.muted} />
        </View>
        <View style={[styles.group, styles.flex1]}>
          <Text style={styles.label}>YEAR</Text>
          <TextInput style={styles.input} value={String(state.year)}
            onChangeText={v => update({ year: parseInt(v, 10) || state.year })}
            keyboardType="number-pad" placeholderTextColor={C.muted} />
        </View>
      </View>

      <View style={styles.divider} />
      <Text style={styles.section}>ELECTRICAL</Text>

      <View style={styles.inlineRow}>
        <View style={styles.flex1}>
          <Text style={styles.label}>VOLTAGE (V)</Text>
          <TextInput style={styles.input} value={String(state.voltage)}
            onChangeText={v => update({ voltage: parseFloat(v) || 0 })}
            keyboardType="decimal-pad" placeholderTextColor={C.muted} />
        </View>
        <View style={styles.flex1}>
          <Text style={styles.label}>CAPACITY (Ah)</Text>
          <TextInput style={styles.input} value={String(state.capacityAh)}
            onChangeText={v => update({ capacityAh: parseFloat(v) || 0 })}
            keyboardType="decimal-pad" placeholderTextColor={C.muted} />
        </View>
        <View style={styles.flex1}>
          <Text style={styles.label}>MOTOR (W)</Text>
          <TextInput style={styles.input} value={String(state.motorWatts)}
            onChangeText={v => update({ motorWatts: parseFloat(v) || 0 })}
            keyboardType="number-pad" placeholderTextColor={C.muted} />
        </View>
      </View>

      <View style={styles.divider} />
      <Text style={styles.section}>PHYSICAL</Text>

      <View style={styles.inlineRow}>
        <View style={styles.flex1}>
          <Text style={styles.label}>WEIGHT (lbs)</Text>
          <TextInput style={styles.input} value={String(state.weightLbs)}
            onChangeText={v => update({ weightLbs: parseFloat(v) || 0 })}
            keyboardType="decimal-pad" placeholderTextColor={C.muted} />
        </View>
        <View style={styles.flex1}>
          <Text style={styles.label}>TOP SPEED (mph)</Text>
          <TextInput style={styles.input} value={String(state.topSpeed)}
            onChangeText={v => update({ topSpeed: parseFloat(v) || 0 })}
            keyboardType="decimal-pad" placeholderTextColor={C.muted} />
        </View>
      </View>

      <View style={styles.group}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>TIRE SIZE</Text>
          {state.tireSizeFromMod && (
            <Text style={styles.modBadge}>from mod log</Text>
          )}
        </View>
        <TextInput style={styles.input} value={state.tireSize}
          onChangeText={v => update({ tireSize: v, tireSizeFromMod: false })}
          placeholderTextColor={C.muted} />
      </View>

      <View style={styles.divider} />
      <CollapsibleSection title="SPECS SUMMARY" defaultOpen={false}>
        <View style={styles.card}>
          {[
            ['Model',       `${state.make} (${state.year})`],
            ['Voltage',     `${state.voltage}V`],
            ['Capacity',    `${state.capacityAh}Ah`],
            ['Total Energy',`${wh}Wh`],
            ['Motor',       `${state.motorWatts}W`],
            ['Weight',      `${state.weightLbs} lbs`],
            ['Tires',       state.tireSize],
            ['Top Speed',   `${state.topSpeed} mph`],
          ].map(([k, v]) => (
            <View key={k} style={styles.specRow}>
              <Text style={styles.specKey}>{k}</Text>
              <Text style={styles.specVal}>{v}</Text>
            </View>
          ))}
        </View>
      </CollapsibleSection>

      <View style={{ height: 20 }} />
    </ScrollView>
  );
}
