import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { C, MONO } from '../../theme/colors';
import { AppState, GearCategory } from '../../state/types';
import { SelectField } from '../SelectField';

interface Props {
  state: AppState;
  update: (u: Partial<AppState>) => void;
}

const GEAR_DEFAULTS: Record<GearCategory, string[]> = {
  footwear: ['Adidas Sambas', 'Weatherproof AF1s', 'Riding Boots', 'Sneakers/casual'],
  helmet: ['Half shell', 'Full face', 'None'],
  gloves: ['Summer/fingerless', 'Full finger', 'Winter/insulated', 'None'],
  jacket: ['None/casual', 'Light layer', 'Moto/armored', 'Rain shell', 'Winter/insulated'],
  cargo: ['None', 'Backpack', 'Pannier bags', 'Front basket', 'Seat bag'],
  lock: ['U-lock', 'Chain lock', 'Cable lock', 'Folding lock', 'None'],
};

function GearCard({
  icon,
  label,
  children,
}: {
  icon: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <Text style={styles.icon}>{icon}</Text>
        <View style={styles.cardContent}>
          <Text style={styles.gearLabel}>{label}</Text>
          {children}
        </View>
      </View>
    </View>
  );
}

function Badge({ text, style }: { text: string; style?: object }) {
  return (
    <View style={[styles.badge, style]}>
      <Text style={styles.badgeText}>{text}</Text>
    </View>
  );
}

export function GearTab({ state, update }: Props) {
  const customOpts = state.customGearOptions ?? {};

  function getOptions(cat: GearCategory): string[] {
    return [...GEAR_DEFAULTS[cat], ...(customOpts[cat] ?? [])];
  }

  function addCustom(cat: GearCategory, item: string) {
    const existing = customOpts[cat] ?? [];
    const allOptions = getOptions(cat);
    if (allOptions.includes(item)) return;
    update({
      customGearOptions: {
        ...customOpts,
        [cat]: [...existing, item],
      },
    });
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.section}>GEAR LOADOUT</Text>

      <GearCard icon="👟" label="FOOTWEAR">
        <SelectField
          label="Footwear"
          value={state.footwear}
          options={getOptions('footwear')}
          onChange={v => update({ footwear: v })}
          onAddCustom={item => addCustom('footwear', item)}
        />
      </GearCard>

      <GearCard icon="⛑️" label="HELMET">
        <SelectField
          label="Helmet"
          value={state.helmet}
          options={getOptions('helmet')}
          onChange={v => update({ helmet: v })}
          onAddCustom={item => addCustom('helmet', item)}
        />
      </GearCard>

      <GearCard icon="🧤" label="GLOVES">
        <SelectField
          label="Gloves"
          value={state.gloves}
          options={getOptions('gloves')}
          onChange={v => update({ gloves: v })}
          onAddCustom={item => addCustom('gloves', item)}
        />
      </GearCard>

      <GearCard icon="🧥" label="JACKET">
        <SelectField
          label="Jacket"
          value={state.jacket}
          options={getOptions('jacket')}
          onChange={v => update({ jacket: v })}
          onAddCustom={item => addCustom('jacket', item)}
        />
      </GearCard>

      <GearCard icon="🎒" label="BAG / CARGO">
        <SelectField
          label="Cargo"
          value={state.cargo}
          options={getOptions('cargo')}
          onChange={v => update({ cargo: v })}
          onAddCustom={item => addCustom('cargo', item)}
        />
      </GearCard>

      <GearCard icon="🔒" label="LOCK">
        <SelectField
          label="Lock"
          value={state.lock}
          options={getOptions('lock')}
          onChange={v => update({ lock: v })}
          onAddCustom={item => addCustom('lock', item)}
        />
        {state.lock === 'Cable lock' && (
          <Badge text="⚠ LOW SECURITY" style={styles.warnBadge} />
        )}
        {state.lock === 'None' && (
          <Badge text="⚠ UNSECURED" style={styles.warnBadge} />
        )}
      </GearCard>

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
  card: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
  },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  icon: { fontSize: 18, width: 24, textAlign: 'center', paddingTop: 2 },
  cardContent: { flex: 1 },
  gearLabel: {
    fontFamily: MONO,
    fontSize: 9,
    color: C.textSec,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginTop: 6,
  },
  warnBadge: {
    backgroundColor: C.redBg,
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.25)',
  },
  badgeText: {
    fontFamily: MONO,
    fontSize: 9,
    color: C.red,
  },
});
