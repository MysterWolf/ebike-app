import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { MONO } from '../theme/colors';

interface Props {
  visible:     boolean;
  distMi:      number;
  durationMin: number;
  onSave:      (battUsed: number) => void;
  onSkip:      () => void;
}

export function BatteryUsedModal({ visible, distMi, durationMin, onSave, onSkip }: Props) {
  const { C } = useTheme();
  const [input, setInput] = useState('');
  const inputRef = useRef<TextInput>(null);

  // Focus only when modal becomes visible — not on mount (which would fire
  // with visible=false and could trigger keyboard/focus conflicts on Android)
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => inputRef.current?.focus(), 200);
    return () => clearTimeout(t);
  }, [visible]);

  const parsed = parseInt(input, 10);
  const valid  = !isNaN(parsed) && parsed >= 0 && parsed <= 100;

  function handleSave() {
    if (!valid) return;
    setInput('');
    onSave(parsed);
  }

  function handleSkip() {
    setInput('');
    onSkip();
  }

  const mins = Math.round(durationMin);

  // Memoised so StyleSheet.create doesn't run on every 150ms telemetry re-render
  const styles = useMemo(() => StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.65)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    card: {
      width: 300,
      borderRadius: 12,
      padding: 24,
      backgroundColor: C.surface,
      borderWidth: 1,
      borderColor: C.border,
    },
    title: {
      fontFamily: MONO,
      fontSize: 13,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      color: C.ink,
      marginBottom: 4,
    },
    summary: {
      fontFamily: MONO,
      fontSize: 12,
      color: C.inkMid,
      marginBottom: 20,
    },
    label: {
      fontFamily: MONO,
      fontSize: 12,
      color: C.ink,
      marginBottom: 10,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 24,
    },
    input: {
      fontFamily: MONO,
      fontSize: 28,
      color: C.ink,
      borderBottomWidth: 2,
      borderBottomColor: C.accent,
      width: 80,
      textAlign: 'center',
      paddingVertical: 4,
    },
    pctLabel: {
      fontFamily: MONO,
      fontSize: 20,
      color: C.inkMid,
      marginLeft: 8,
    },
    buttons: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    skipBtn: {
      paddingVertical: 10,
      paddingHorizontal: 16,
    },
    skipText: {
      fontFamily: MONO,
      fontSize: 13,
      color: C.inkMid,
    },
    saveBtn: {
      paddingVertical: 10,
      paddingHorizontal: 28,
      borderRadius: 6,
      backgroundColor: C.accent,
    },
    saveBtnDisabled: {
      backgroundColor: C.border,
    },
    saveText: {
      fontFamily: MONO,
      fontSize: 13,
      letterSpacing: 1,
      color: '#FFFFFF',
      textTransform: 'uppercase',
    },
  }), [C]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleSkip}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={styles.card}>
          <Text style={styles.title}>Ride Complete</Text>
          <Text style={styles.summary}>
            {distMi.toFixed(1)} mi · {mins} min
          </Text>
          <Text style={styles.label}>How much battery did you use?</Text>
          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              keyboardType="number-pad"
              placeholder="—"
              placeholderTextColor={C.muted}
              value={input}
              onChangeText={v => setInput(v.replace(/[^0-9]/g, ''))}
              maxLength={3}
            />
            <Text style={styles.pctLabel}>%</Text>
          </View>
          <View style={styles.buttons}>
            <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, !valid && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={!valid}
            >
              <Text style={styles.saveText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
