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
  state:  AppState;
  update: (u: Partial<AppState>) => void;
  onBack: () => void;
}

function FieldLabel({ children }: { children: string }) {
  return <Text style={s.fieldLabel}>{children}</Text>;
}

function Input(props: React.ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      style={s.input}
      placeholderTextColor={C.textTer}
      autoCorrect={false}
      {...props}
    />
  );
}

export function EditBikeScreen({ state, update, onBack }: Props) {
  const [make,     setMake]     = useState(state.make);
  const [model,    setModel]    = useState(state.model);
  const [nickname, setNickname] = useState(state.nickname);
  const [error,    setError]    = useState('');

  function handleSave() {
    if (!make.trim())  { setError('Make is required.'); return; }
    if (!model.trim()) { setError('Model is required.'); return; }
    // update() writes to React state AND AsyncStorage atomically
    update({ make: make.trim(), model: model.trim(), nickname: nickname.trim() });
    onBack();
  }

  return (
    <SafeAreaView style={s.root}>
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Back arrow ── */}
          <TouchableOpacity
            style={s.backRow}
            onPress={onBack}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <Text style={s.backArrow}>←</Text>
            <Text style={s.backLabel}>Back</Text>
          </TouchableOpacity>

          {/* ── Branding ── */}
          <View style={s.brand}>
            <Text style={s.brandTitle}>E-BIKE</Text>
            <Text style={s.brandSub}>MISSION CONTROL</Text>
          </View>

          {/* ── Screen header ── */}
          <View style={s.stepHeader}>
            <Text style={s.stepTitle}>Edit Bike Profile</Text>
            <Text style={s.stepSub}>
              Update your bike's identity. All ride data, logs, and settings are preserved.
            </Text>
          </View>

          {/* ── Fields ── */}
          <View style={s.fields}>
            <View style={s.fieldGroup}>
              <FieldLabel>MAKE *</FieldLabel>
              <Input
                value={make}
                onChangeText={t => { setMake(t); setError(''); }}
                placeholder="e.g. Movcan"
                returnKeyType="next"
              />
            </View>

            <View style={s.fieldGroup}>
              <FieldLabel>MODEL *</FieldLabel>
              <Input
                value={model}
                onChangeText={t => { setModel(t); setError(''); }}
                placeholder="e.g. V70"
                returnKeyType="next"
              />
            </View>

            <View style={s.fieldGroup}>
              <FieldLabel>NICKNAME (OPTIONAL)</FieldLabel>
              <Input
                value={nickname}
                onChangeText={setNickname}
                placeholder="e.g. Sparky"
                returnKeyType="done"
              />
            </View>

            {!!error && <Text style={s.error}>{error}</Text>}

            <View style={s.hint}>
              <Text style={s.hintText}>
                Nickname overrides Make / Model in the mission header if set.
              </Text>
            </View>
          </View>

          {/* ── Actions ── */}
          <View style={s.actions}>
            <TouchableOpacity style={s.cancelBtn} onPress={onBack} activeOpacity={0.7}>
              <Text style={s.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.saveBtn} onPress={handleSave} activeOpacity={0.8}>
              <Text style={s.saveBtnText}>SAVE CHANGES</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:  { flex: 1, backgroundColor: C.bg },
  flex:  { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
  },

  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 28,
  },
  backArrow: {
    fontFamily: MONO,
    fontSize: 16,
    color: C.accent,
    lineHeight: 18,
  },
  backLabel: {
    fontFamily: MONO,
    fontSize: 12,
    color: C.accent,
    letterSpacing: 0.5,
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

  stepHeader: { marginBottom: 28 },
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

  fields:     { marginBottom: 8 },
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

  error: {
    fontFamily: MONO,
    fontSize: 11,
    color: C.red,
    marginBottom: 12,
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
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  cancelBtnText: {
    fontFamily: MONO,
    fontSize: 13,
    color: C.textSec,
  },
  saveBtn: {
    flex: 1,
    backgroundColor: C.accent,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnText: {
    fontFamily: MONO,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: C.white,
  },
});
