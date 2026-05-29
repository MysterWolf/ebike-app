import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { MONO } from '../../theme/colors';
import { AppState, GearCategory } from '../../state/types';
import { SelectField } from '../SelectField';

interface Props {
  state: AppState;
  update: (u: Partial<AppState>) => void;
}

const GEAR_DEFAULTS: Record<GearCategory, string[]> = {
  footwear: ['Adidas Sambas', 'Weatherproof AF1s', 'Riding Boots', 'Sneakers/casual'],
  helmet:   ['Half shell', 'Full face', 'None'],
  gloves:   ['Summer/fingerless', 'Full finger', 'Winter/insulated', 'None'],
  jacket:   ['None/casual', 'Light layer', 'Moto/armored', 'Rain shell', 'Winter/insulated'],
  cargo:    ['None', 'Backpack', 'Pannier bags', 'Front basket', 'Seat bag'],
  lock:     ['U-lock', 'Chain lock', 'Cable lock', 'Folding lock', 'None'],
};

export function GearTab({ state, update }: Props) {
  const { C } = useTheme();

  const styles = useMemo(() => StyleSheet.create({
    scroll:   { flex: 1, backgroundColor: C.background },
    content:  { padding: 12 },
    section:  {
      fontFamily: MONO, fontSize: 8, letterSpacing: 2, color: C.accent,
      textTransform: 'uppercase', marginBottom: 8, marginTop: 2,
    },
    card:     {
      backgroundColor: C.white,
      borderWidth: 1, borderColor: C.border, borderRadius: 6, padding: 10, marginBottom: 8,
    },
    cardRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    icon:     { fontSize: 18, width: 24, textAlign: 'center', paddingTop: 2 },
    cardContent: { flex: 1 },
    gearLabel: { fontFamily: MONO, fontSize: 9, color: C.inkMid, letterSpacing: 0.5, marginBottom: 6 },
    badge:     { alignSelf: 'flex-start', borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3, marginTop: 6 },
    warnBadge: { backgroundColor: C.dangerTint, borderWidth: 1, borderColor: C.dangerTint },
    badgeText: { fontFamily: MONO, fontSize: 9, color: C.danger },
  }), [C]);

  const customOpts = state.customGearOptions ?? {};

  function getOptions(cat: GearCategory): string[] {
    return [...GEAR_DEFAULTS[cat], ...(customOpts[cat] ?? [])];
  }

  function addCustom(cat: GearCategory, item: string) {
    const existing = customOpts[cat] ?? [];
    if (getOptions(cat).includes(item)) return;
    update({ customGearOptions: { ...customOpts, [cat]: [...existing, item] } });
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.section}>GEAR LOADOUT</Text>

      {([
        { icon: '👟', label: 'FOOTWEAR',   cat: 'footwear' as GearCategory, key: 'footwear'  as keyof AppState },
        { icon: '⛑️', label: 'HELMET',     cat: 'helmet'   as GearCategory, key: 'helmet'    as keyof AppState },
        { icon: '🧤', label: 'GLOVES',     cat: 'gloves'   as GearCategory, key: 'gloves'    as keyof AppState },
        { icon: '🧥', label: 'JACKET',     cat: 'jacket'   as GearCategory, key: 'jacket'    as keyof AppState },
        { icon: '🎒', label: 'BAG / CARGO',cat: 'cargo'    as GearCategory, key: 'cargo'     as keyof AppState },
        { icon: '🔒', label: 'LOCK',       cat: 'lock'     as GearCategory, key: 'lock'      as keyof AppState },
      ] as Array<{ icon: string; label: string; cat: GearCategory; key: keyof AppState }>).map(({ icon, label, cat, key }) => (
        <View key={cat} style={styles.card}>
          <View style={styles.cardRow}>
            <Text style={styles.icon}>{icon}</Text>
            <View style={styles.cardContent}>
              <Text style={styles.gearLabel}>{label}</Text>
              <SelectField
                label={label}
                value={state[key] as string}
                options={getOptions(cat)}
                onChange={v => update({ [key]: v } as Partial<AppState>)}
                onAddCustom={item => addCustom(cat, item)}
              />
              {key === 'lock' && state.lock === 'Cable lock' && (
                <View style={[styles.badge, styles.warnBadge]}>
                  <Text style={styles.badgeText}>⚠ LOW SECURITY</Text>
                </View>
              )}
              {key === 'lock' && state.lock === 'None' && (
                <View style={[styles.badge, styles.warnBadge]}>
                  <Text style={styles.badgeText}>⚠ UNSECURED</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      ))}

      <View style={{ height: 20 }} />
    </ScrollView>
  );
}
