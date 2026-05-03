import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { C, MONO } from '../theme/colors';

interface Props {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  onAddCustom?: (item: string) => void;
}

export function SelectField({ label, value, options, onChange, onAddCustom }: Props) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newItem, setNewItem] = useState('');
  const inputRef = useRef<TextInput>(null);

  function close() {
    setOpen(false);
    setAdding(false);
    setNewItem('');
  }

  function startAdding() {
    setAdding(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function commitAdd() {
    const trimmed = newItem.trim();
    if (!trimmed) return;
    onAddCustom?.(trimmed);
    onChange(trimmed);
    close();
  }

  function cancelAdd() {
    setAdding(false);
    setNewItem('');
  }

  return (
    <>
      <TouchableOpacity style={styles.field} onPress={() => setOpen(true)} activeOpacity={0.7}>
        <Text style={styles.value} numberOfLines={1}>{value}</Text>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide">
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={close} />
        <View style={styles.sheet}>
          <SafeAreaView>
            <View style={styles.sheetHeader}>
              {adding ? (
                <>
                  <TouchableOpacity onPress={cancelAdd} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.cancel}>Cancel</Text>
                  </TouchableOpacity>
                  <Text style={styles.sheetLabel}>ADD ITEM</Text>
                  <TouchableOpacity
                    onPress={commitAdd}
                    disabled={!newItem.trim()}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={[styles.done, !newItem.trim() && styles.doneDisabled]}>Add</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.sheetLabel}>{label}</Text>
                  <TouchableOpacity onPress={close} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.done}>Done</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            {adding ? (
              <View style={styles.addForm}>
                <TextInput
                  ref={inputRef}
                  style={styles.addInput}
                  placeholder={`New ${label.toLowerCase()} item...`}
                  placeholderTextColor={C.textTer}
                  value={newItem}
                  onChangeText={setNewItem}
                  returnKeyType="done"
                  onSubmitEditing={commitAdd}
                  autoCorrect={false}
                />
                <Text style={styles.addHint}>
                  This item will be added to your {label.toLowerCase()} options.
                </Text>
              </View>
            ) : (
              <ScrollView bounces={false}>
                {options.map(opt => (
                  <TouchableOpacity
                    key={opt}
                    style={[styles.option, opt === value && styles.optionActive]}
                    onPress={() => { onChange(opt); close(); }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.optionText, opt === value && styles.optionTextActive]}>
                      {opt}
                    </Text>
                    {opt === value && <Text style={styles.check}>✓</Text>}
                  </TouchableOpacity>
                ))}
                {onAddCustom && (
                  <TouchableOpacity style={styles.addRow} onPress={startAdding} activeOpacity={0.7}>
                    <Text style={styles.addRowText}>+ Add custom item...</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            )}
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  value: {
    fontFamily: MONO,
    fontSize: 12,
    color: C.text,
    flex: 1,
  },
  chevron: {
    fontSize: 18,
    color: C.textTer,
    marginLeft: 4,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    maxHeight: '60%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  sheetLabel: {
    fontFamily: MONO,
    fontSize: 11,
    letterSpacing: 1,
    color: C.textSec,
    textTransform: 'uppercase',
  },
  done: {
    fontSize: 15,
    color: C.accent,
    fontWeight: '600',
  },
  doneDisabled: {
    opacity: 0.35,
  },
  cancel: {
    fontSize: 15,
    color: C.textSec,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  optionActive: {
    backgroundColor: C.accentBg,
  },
  optionText: {
    fontSize: 15,
    color: C.text,
  },
  optionTextActive: {
    color: C.accent,
    fontWeight: '600',
  },
  check: {
    fontSize: 15,
    color: C.accent,
    fontWeight: '700',
  },
  addRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  addRowText: {
    fontSize: 15,
    color: C.accent,
    fontWeight: '500',
  },
  addForm: {
    padding: 16,
    gap: 10,
  },
  addInput: {
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.accent,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: C.text,
  },
  addHint: {
    fontFamily: MONO,
    fontSize: 10,
    color: C.textTer,
    letterSpacing: 0.3,
  },
});
