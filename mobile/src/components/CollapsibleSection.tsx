import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { C, MONO } from '../theme/colors';

interface Props {
  title: string;
  defaultOpen?: boolean;
  badge?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}

export function CollapsibleSection({ title, defaultOpen = true, badge, right, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <>
      <View style={styles.header}>
        <TouchableOpacity style={styles.toggle} onPress={() => setOpen(o => !o)} activeOpacity={0.7}>
          <Text style={styles.chevron}>{open ? '▾' : '▸'}</Text>
          <Text style={styles.title}>{title}</Text>
          {badge !== undefined && <Text style={styles.badge}>{badge}</Text>}
        </TouchableOpacity>
        {right !== undefined && <View>{right}</View>}
      </View>
      {open ? children : null}
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    marginTop: 2,
  },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  chevron: { fontSize: 14, color: C.accent, width: 14 },
  title: {
    fontFamily: MONO,
    fontSize: 8,
    letterSpacing: 2,
    color: C.accent,
    textTransform: 'uppercase',
    flex: 1,
  },
  badge: { fontFamily: MONO, fontSize: 9, color: C.textSec, marginRight: 10 },
});
