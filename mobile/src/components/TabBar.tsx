import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { C, MONO } from '../theme/colors';
import { Tab } from '../state/types';

const TABS: { id: Tab; label: string }[] = [
  { id: 'ride', label: 'RIDE' },
  { id: 'bike', label: 'BIKE' },
  { id: 'gear', label: 'GEAR' },
  { id: 'ops', label: 'OPS' },
  { id: 'chat', label: 'CHAT' },
];

interface Props {
  active: Tab;
  onSelect: (tab: Tab) => void;
}

export function TabBar({ active, onSelect }: Props) {
  return (
    <View style={styles.bar}>
      {TABS.map(tab => {
        const isActive = tab.id === active;
        return (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tab, isActive && styles.tabActive]}
            onPress={() => onSelect(tab.id)}
            activeOpacity={0.7}
          >
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: C.accent,
  },
  label: {
    fontFamily: MONO,
    fontSize: 10,
    letterSpacing: 1,
    color: C.textTer,
  },
  labelActive: {
    color: C.accent,
    fontWeight: '700',
  },
});
