import React, { useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, Platform, Share, Alert,
} from 'react-native';
import RNFS from 'react-native-fs';
import { BleStatus, BLE_LOG_FILE } from '../services/BleService';
import { useBleContext } from '../context/BleContext';

const C = {
  bg: '#0A0E1A', surface: '#141824', border: '#1E2535',
  text: '#E8EDF5', muted: '#6B7A99', accent: '#1D6B3E',
  amber: '#C4883A', danger: '#B85450', sage: '#1D9E75',
  white: '#FFFFFF',
};

function StatusDot({ status }: { status: BleStatus }) {
  const color = status === 'connected' ? C.sage
    : status === 'connecting' || status === 'scanning' ? C.amber
    : status === 'error' ? C.danger : C.muted;
  return (
    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
  );
}

function ByteGrid({ hex, label }: { hex: string; label: string }) {
  if (!hex) return null;
  const bytes = hex.match(/.{1,2}/g) ?? [];
  return (
    <View style={s.byteCard}>
      <Text style={s.byteLabel}>{label}</Text>
      <View style={s.byteGrid}>
        {bytes.map((b, i) => (
          <View key={i} style={s.byteCell}>
            <Text style={s.byteIndex}>{i}</Text>
            <Text style={s.byteHex}>{b}</Text>
            <Text style={s.byteDec}>{parseInt(b, 16)}</Text>
          </View>
        ))}
      </View>
      <Text style={s.byteRaw}>{hex}</Text>
    </View>
  );
}

export function TelemetryScreen() {
  const { status, statusMsg, telemetry, log, connect, disconnect } = useBleContext();

  const handleConnect = useCallback(async () => {
    if (status === 'connected') {
      await disconnect();
    } else {
      await connect();
    }
  }, [status, connect, disconnect]);

  const handleShareLog = useCallback(async () => {
    try {
      const content = await RNFS.readFile(BLE_LOG_FILE, 'utf8');
      await Share.share({ title: 'BLE Diagnostic Log', message: content });
    } catch (err: any) {
      Alert.alert('Log unavailable', 'Connect to the bike first to generate a log.\n\n' + err.message);
    }
  }, []);

  const btnLabel = status === 'connected' ? 'Disconnect'
    : status === 'scanning' ? 'Scanning...'
    : status === 'connecting' ? 'Connecting...'
    : 'Connect to V70';

  const btnDisabled = status === 'scanning' || status === 'connecting';

  return (
    <View style={s.root}>
      <View style={s.header}>
        <Text style={s.title}>V70 Telemetry</Text>
        <View style={s.statusRow}>
          <StatusDot status={status} />
          <Text style={s.statusText}>{status}{statusMsg ? ` — ${statusMsg}` : ''}</Text>
        </View>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>

        <Pressable
          onPress={handleConnect}
          disabled={btnDisabled}
          style={[s.connectBtn,
            status === 'connected' && { backgroundColor: C.danger },
            btnDisabled && { opacity: 0.5 }
          ]}>
          <Text style={s.connectBtnText}>{btnLabel}</Text>
        </Pressable>

        <Pressable onPress={handleShareLog} style={s.logBtn}>
          <Text style={s.logBtnText}>Share Diagnostic Log</Text>
        </Pressable>

        {telemetry && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Decoded values</Text>
            {[
              { label: 'Speed',        value: telemetry.speed_mph,    unit: ' mph' },
              { label: 'Speed (kph)',  value: telemetry.speed_kph,    unit: ' km/h' },
              { label: 'Voltage',      value: telemetry.battery_v,    unit: ' V' },
              { label: 'Battery',      value: telemetry.battery_pct,  unit: '%' },
              { label: 'Assist',       value: telemetry.assist_level, unit: '' },
              { label: 'Odometer',     value: telemetry.odometer_raw, unit: '' },
              { label: 'Load (TBD)',   value: telemetry.load_raw,     unit: '' },
              { label: 'Word2 (TBD)', value: telemetry.word2_raw,    unit: '' },
              { label: 'Motor',        value: telemetry.motor_w,      unit: ' W' },
              { label: 'Cadence',      value: telemetry.cadence_rpm,  unit: ' rpm' },
            ].map(({ label, value, unit }) => (
              <View key={label} style={s.metricRow}>
                <Text style={s.metricLabel}>{label}</Text>
                <Text style={[s.metricValue, value == null && { color: C.muted }]}>
                  {value != null ? `${value}${unit}` : '—'}
                </Text>
              </View>
            ))}
          </View>
        )}

        {telemetry?.raw_notify_2 && (
          <ByteGrid hex={telemetry.raw_notify_2} label="Notify 2 (12FF69A4)" />
        )}

        {log.length > 0 && (
          <View style={s.logCard}>
            <Text style={s.sectionTitle}>Log</Text>
            {log.map((line, i) => (
              <Text key={i} style={s.logLine}>{line}</Text>
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg },
  header:  { paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 28,
    paddingBottom: 16, borderBottomWidth: 0.5, borderBottomColor: C.border },
  title:   { fontSize: 22, fontWeight: '500', color: C.text, letterSpacing: 0.3 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  statusText: { fontSize: 12, color: C.muted },
  scroll:  { flex: 1 },
  scrollContent: { padding: 16, gap: 12 },
  connectBtn: { backgroundColor: C.accent, borderRadius: 8,
    paddingVertical: 14, alignItems: 'center' },
  connectBtnText: { color: C.white, fontSize: 15, fontWeight: '500' },
  logBtn: { borderRadius: 8, paddingVertical: 10, alignItems: 'center',
    borderWidth: 0.5, borderColor: C.border },
  logBtnText: { color: C.muted, fontSize: 13 },
  section: { backgroundColor: C.surface, borderRadius: 10,
    borderWidth: 0.5, borderColor: C.border, padding: 14, gap: 8 },
  sectionTitle: { fontSize: 11, color: C.muted, letterSpacing: 0.6,
    textTransform: 'uppercase', marginBottom: 4 },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: C.border },
  metricLabel: { fontSize: 14, color: C.muted },
  metricValue: { fontSize: 14, fontWeight: '500', color: C.text },
  byteCard: { backgroundColor: C.surface, borderRadius: 10,
    borderWidth: 0.5, borderColor: C.border, padding: 14 },
  byteLabel: { fontSize: 11, color: C.muted, letterSpacing: 0.6,
    textTransform: 'uppercase', marginBottom: 10 },
  byteGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  byteCell: { backgroundColor: C.bg, borderRadius: 4, borderWidth: 0.5,
    borderColor: C.border, padding: 6, alignItems: 'center', minWidth: 44 },
  byteIndex: { fontSize: 8, color: C.muted },
  byteHex:   { fontSize: 13, fontWeight: '500', color: C.sage },
  byteDec:   { fontSize: 10, color: C.muted },
  byteRaw:   { fontSize: 11, color: C.muted, fontFamily: 'monospace' },
  logCard:   { backgroundColor: C.surface, borderRadius: 10,
    borderWidth: 0.5, borderColor: C.border, padding: 14, gap: 4 },
  logLine:   { fontSize: 11, color: C.muted, fontFamily: 'monospace', lineHeight: 18 },
});
