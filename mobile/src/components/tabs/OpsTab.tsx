import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Switch,
  Modal,
  StyleSheet,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import { exportData, importData } from '../../utils/dataExport';
import { CollapsibleSection } from '../CollapsibleSection';
import { C, MONO } from '../../theme/colors';
import {
  AppState,
  DEFAULT_STATE,
  TirePressureEntry,
  ServiceLogEntry,
  ModLogEntry,
  ModCategory,
} from '../../state/types';
import { OPS_PROMPTS } from '../../utils/ai';
import { nextService } from '../../utils/calculations';

interface Props {
  state: AppState;
  update: (u: Partial<AppState>) => void;
  onMissionAction: (text: string) => void;
  onReset: () => void;
  onEditProfile: () => void;
}

interface ChecklistItem {
  key: string;
  label: string;
  sublabel: string;
}

const MOD_CATEGORIES: ModCategory[] = [
  'Tires', 'Brakes', 'Lighting', 'Motor', 'Battery', 'Handlebars', 'Seat', 'Other',
];

const MOUNT_TYPES = ['Handlebar Mount', 'Stem Mount', 'Frame Mount', 'Other'];
const PRIMARY_USES = ['Recording', 'Navigation', 'Music', 'All of the above'];

const MOD_COLORS: Record<ModCategory, { bg: string; text: string }> = {
  Tires:      { bg: C.amberBg,     text: C.amber },
  Brakes:     { bg: C.redBg,       text: C.red },
  Lighting:   { bg: 'rgba(255,204,0,0.1)', text: '#9a7000' },
  Motor:      { bg: C.accentBg,    text: C.accent },
  Battery:    { bg: C.accentBg,    text: C.accent },
  Handlebars: { bg: C.surfaceAlt,  text: C.textSec },
  Seat:       { bg: C.surfaceAlt,  text: C.textSec },
  Other:      { bg: C.surfaceAlt,  text: C.textSec },
};

function formatDate(): string {
  const now = new Date();
  return (
    now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ', ' +
    now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  );
}

function buildGearItems(state: AppState): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  if (state.helmet !== 'None')
    items.push({ key: 'gear-helmet', label: 'Helmet on', sublabel: state.helmet });
  if (state.gloves !== 'None')
    items.push({ key: 'gear-gloves', label: 'Gloves ready', sublabel: state.gloves });
  if (state.jacket !== 'None/casual')
    items.push({ key: 'gear-jacket', label: 'Jacket on', sublabel: state.jacket });
  if (state.cargo !== 'None')
    items.push({ key: 'gear-cargo', label: 'Cargo secured', sublabel: state.cargo });
  if (state.lock !== 'None')
    items.push({ key: 'gear-lock', label: 'Lock packed', sublabel: state.lock });
  if (state.rigOnline && state.rigDeviceName)
    items.push({ key: 'gear-rig', label: 'Media rig', sublabel: `${state.rigDeviceName} · Mounted` });
  return items;
}

function Divider() {
  return <View style={styles.divider} />;
}

function OpsButton({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.opsBtn} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.opsBtnIcon}>{icon}</Text>
      <Text style={styles.opsBtnLabel}>{label}</Text>
      <Text style={styles.opsBtnArrow}>›</Text>
    </TouchableOpacity>
  );
}

export function OpsTab({ state, update, onMissionAction, onReset, onEditProfile }: Props) {
  const [dataLoading, setDataLoading] = useState<'export' | 'import' | null>(null);
  const [frontPsiInput, setFrontPsiInput] = useState('');
  const [rearPsiInput, setRearPsiInput] = useState('');
  const [psiError, setPsiError] = useState(false);
  const [serviceNotes, setServiceNotes] = useState('');

  // Mod modal local state
  const [modModalVisible, setModModalVisible] = useState(false);
  const [modCategory, setModCategory] = useState<ModCategory>('Tires');
  const [modComponent, setModComponent] = useState('');
  const [modNotes, setModNotes] = useState('');
  const [modComponentError, setModComponentError] = useState(false);

  const displayName = state.nickname || (state.model ? `${state.make} ${state.model}` : state.make);

  const checklist = state.checklistState ?? {};
  const pressureLog = [...(state.tirePressureLog ?? [])].reverse().slice(0, 5);
  const svcLog = (state.serviceLog ?? [])
    .map((entry, origIdx) => ({ entry, origIdx }))
    .reverse();
  const modLog = [...(state.modLog ?? [])].reverse();
  const hasApiKey = !!(state.apiKey && state.apiKey.length > 10);
  const gearItems = buildGearItems(state);
  const ns = nextService(state.odometer);
  const miToService = Math.max(0, ns - state.odometer);
  const serviceNear = miToService < 50;

  const checkedCount =
    (checklist['tire-pressure'] ? 1 : 0) +
    (checklist['lights'] ? 1 : 0) +
    (checklist['brakes'] ? 1 : 0) +
    (checklist['battery'] ? 1 : 0) +
    gearItems.filter(i => checklist[i.key]).length;
  const totalItems = 4 + gearItems.length;

  // ── Checklist handlers ──
  function toggleItem(key: string) {
    update({ checklistState: { ...checklist, [key]: !checklist[key] } });
  }

  function toggleTirePressure() {
    update({ checklistState: { ...checklist, 'tire-pressure': !checklist['tire-pressure'] } });
  }

  // ── PSI log handler ──
  function logPsi() {
    const front = parseFloat(frontPsiInput);
    const rear = parseFloat(rearPsiInput);
    if (isNaN(front) || front <= 0 || isNaN(rear) || rear <= 0) {
      setPsiError(true);
      setTimeout(() => setPsiError(false), 1400);
      return;
    }
    const entry: TirePressureEntry = { front, rear, date: formatDate() };
    update({ tirePressureLog: [...(state.tirePressureLog ?? []), entry] });
    setFrontPsiInput('');
    setRearPsiInput('');
  }

  // ── Service log handler ──
  function logService() {
    const entry: ServiceLogEntry = {
      date: formatDate(),
      notes: serviceNotes.trim() || 'Service performed',
      odometer: state.odometer,
    };
    update({ serviceLog: [...(state.serviceLog ?? []), entry] });
    setServiceNotes('');
  }

  // ── Delete handlers ──
  function deleteServiceEntry(origIdx: number) {
    Alert.alert(
      'Remove Entry',
      'Delete this service event from the log?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => update({ serviceLog: state.serviceLog.filter((_, i) => i !== origIdx) }),
        },
      ],
    );
  }

  function deleteModEntry(mod: ModLogEntry) {
    Alert.alert(
      'Remove Mod',
      'Delete this entry from the mod log?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const newLog = state.modLog.filter(m => m.id !== mod.id);
            const affectsTireSpec =
              mod.category === 'Tires' &&
              state.tireSizeFromMod &&
              state.tireSize === mod.component;

            if (!affectsTireSpec) {
              update({ modLog: newLog });
              return;
            }

            const prevTireMod = [...newLog].reverse().find(m => m.category === 'Tires');
            Alert.alert(
              'Tire Spec',
              prevTireMod
                ? `This mod set the current tire spec. Revert to "${prevTireMod.component}" (previous tire mod) or keep "${mod.component}"?`
                : `This mod set the current tire spec. Clear the BIKE tab tire spec or keep "${mod.component}"?`,
              [
                {
                  text: prevTireMod ? `Revert to "${prevTireMod.component}"` : 'Clear spec',
                  onPress: () =>
                    update({
                      modLog: newLog,
                      tireSize: prevTireMod ? prevTireMod.component : '',
                      tireSizeFromMod: !!prevTireMod,
                    }),
                },
                {
                  text: `Keep "${mod.component}"`,
                  onPress: () => update({ modLog: newLog, tireSizeFromMod: false }),
                },
              ],
            );
          },
        },
      ],
    );
  }

  // ── Mod modal handlers ──
  function openModModal() {
    setModCategory('Tires');
    setModComponent('');
    setModNotes('');
    setModComponentError(false);
    setModModalVisible(true);
  }

  function saveMod() {
    const trimmedComponent = modComponent.trim();
    if (!trimmedComponent) {
      setModComponentError(true);
      setTimeout(() => setModComponentError(false), 1400);
      return;
    }
    const entry: ModLogEntry = {
      id: Date.now().toString(),
      category: modCategory,
      component: trimmedComponent,
      notes: modNotes.trim(),
      date: formatDate(),
    };
    const updates: Partial<AppState> = {
      modLog: [...(state.modLog ?? []), entry],
    };
    if (modCategory === 'Tires') {
      updates.tireSize = trimmedComponent;
      updates.tireSizeFromMod = true;
    }
    update(updates);
    setModModalVisible(false);
  }

  // ── Data management handlers ──
  async function handleExport() {
    setDataLoading('export');
    try {
      await exportData(state);
    } catch (err: any) {
      Alert.alert('Export Failed', err?.message || 'Could not export data.');
    } finally {
      setDataLoading(null);
    }
  }

  async function handleImport() {
    setDataLoading('import');
    try {
      const imported = await importData();
      if (!imported) { setDataLoading(null); return; }
      update({ ...imported, apiKey: state.apiKey || imported.apiKey });
      Alert.alert('Import Successful', 'Backup restored. Your API key was preserved.');
    } catch (err: any) {
      if (!DocumentPicker.isCancel(err)) {
        Alert.alert('Import Failed', err?.message || 'Could not read backup file.');
      }
    } finally {
      setDataLoading(null);
    }
  }

  function handleResetBikeProfile() {
    Alert.alert(
      'Reset Bike Profile',
      'Restore Make, Model, and Nickname to defaults? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => update({
            make: DEFAULT_STATE.make,
            model: DEFAULT_STATE.model,
            nickname: DEFAULT_STATE.nickname,
          }),
        },
      ],
    );
  }

  function handleReset() {
    Alert.alert(
      'Reset App Data',
      'This will delete all rides, logs, mods, settings, and messages. Your API key will be preserved. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset', style: 'destructive', onPress: onReset },
      ],
    );
  }

  return (
    <>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>

        {/* ── HARDWARE STATUS ── */}
        <CollapsibleSection title="HARDWARE STATUS" defaultOpen={false}>
        <View style={styles.rigCard}>

          <View style={styles.rigField}>
            <Text style={styles.rigFieldLabel}>DEVICE NAME</Text>
            <TextInput
              style={styles.rigInput}
              value={state.rigDeviceName}
              onChangeText={v => update({ rigDeviceName: v })}
              placeholder="e.g. Samsung S8"
              placeholderTextColor={C.textTer}
              autoCorrect={false}
            />
          </View>

          <View style={styles.rigField}>
            <Text style={styles.rigFieldLabel}>MOUNT TYPE</Text>
            <View style={styles.chipRow}>
              {MOUNT_TYPES.map(mt => (
                <TouchableOpacity
                  key={mt}
                  style={[styles.chip, state.rigMountType === mt && styles.chipActive]}
                  onPress={() => update({ rigMountType: state.rigMountType === mt ? '' : mt })}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, state.rigMountType === mt && styles.chipTextActive]}>
                    {mt}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.rigField}>
            <Text style={styles.rigFieldLabel}>PRIMARY USE</Text>
            <View style={styles.chipRow}>
              {PRIMARY_USES.map(pu => (
                <TouchableOpacity
                  key={pu}
                  style={[styles.chip, state.rigPrimaryUse === pu && styles.chipActive]}
                  onPress={() => update({ rigPrimaryUse: state.rigPrimaryUse === pu ? '' : pu })}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, state.rigPrimaryUse === pu && styles.chipTextActive]}>
                    {pu}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.rigToggleRow}>
            <Text style={[styles.toggleStatus, state.rigOnline && styles.toggleStatusOn]}>
              {state.rigOnline ? 'ONLINE' : 'OFFLINE'}
            </Text>
            <Switch
              value={state.rigOnline}
              onValueChange={v => update({ rigOnline: v })}
              trackColor={{ false: C.border, true: C.accentDim }}
              thumbColor={state.rigOnline ? C.accent : C.textTer}
            />
          </View>

        </View>
        </CollapsibleSection>

        <Divider />

        {/* ── PRE-MISSION CHECKLIST ── */}
        <CollapsibleSection
          title="PRE-MISSION CHECKLIST"
          defaultOpen={false}
          badge={`${checkedCount}/${totalItems}`}
          right={
            <TouchableOpacity onPress={() => update({ checklistState: {} })} activeOpacity={0.7}>
              <Text style={styles.resetBtn}>RESET</Text>
            </TouchableOpacity>
          }
        >
          <>
            <View style={styles.progressRow}>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${totalItems > 0 ? (checkedCount / totalItems) * 100 : 0}%` as any },
                  ]}
                />
              </View>
              <Text style={styles.progressLabel}>{checkedCount}/{totalItems}</Text>
            </View>

            <View style={styles.card}>
              <View style={styles.checkRow}>
                <TouchableOpacity
                  style={[styles.checkbox, checklist['tire-pressure'] && styles.checkboxChecked]}
                  onPress={toggleTirePressure}
                  activeOpacity={0.7}
                >
                  {checklist['tire-pressure'] && <Text style={styles.checkmark}>✓</Text>}
                </TouchableOpacity>
                <View style={styles.checkContent}>
                  <Text style={[styles.checkLabel, checklist['tire-pressure'] && styles.checkLabelDone]}>
                    Tire pressure
                  </Text>
                </View>
              </View>

              {[
                { key: 'lights',  label: 'Lights',  sublabel: 'Front & rear operational' },
                { key: 'brakes',  label: 'Brakes',  sublabel: 'Front & rear responsive' },
                { key: 'battery', label: 'Battery', sublabel: `Current: ${state.battery}%` },
              ].map(item => (
                <View key={item.key} style={styles.checkRow}>
                  <TouchableOpacity
                    style={[styles.checkbox, checklist[item.key] && styles.checkboxChecked]}
                    onPress={() => toggleItem(item.key)}
                    activeOpacity={0.7}
                  >
                    {checklist[item.key] && <Text style={styles.checkmark}>✓</Text>}
                  </TouchableOpacity>
                  <View style={styles.checkContent}>
                    <Text style={[styles.checkLabel, checklist[item.key] && styles.checkLabelDone]}>
                      {item.label}
                    </Text>
                    <Text style={styles.checkSublabel}>{item.sublabel}</Text>
                  </View>
                </View>
              ))}

              {gearItems.map(item => (
                <View key={item.key} style={styles.checkRow}>
                  <TouchableOpacity
                    style={[styles.checkbox, checklist[item.key] && styles.checkboxChecked]}
                    onPress={() => toggleItem(item.key)}
                    activeOpacity={0.7}
                  >
                    {checklist[item.key] && <Text style={styles.checkmark}>✓</Text>}
                  </TouchableOpacity>
                  <View style={styles.checkContent}>
                    <Text style={[styles.checkLabel, checklist[item.key] && styles.checkLabelDone]}>
                      {item.label}
                    </Text>
                    <Text style={styles.checkSublabel}>{item.sublabel}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        </CollapsibleSection>

        <Divider />

        {/* ── TIRE PRESSURE LOG ── */}
        <CollapsibleSection title="TIRE PRESSURE LOG" defaultOpen={true}>

        <View style={styles.logInputRow}>
          <TextInput
            style={[styles.logInput, psiError && styles.inputError]}
            value={frontPsiInput}
            onChangeText={setFrontPsiInput}
            keyboardType="decimal-pad"
            placeholder="Front PSI"
            placeholderTextColor={C.textTer}
          />
          <TextInput
            style={[styles.logInput, psiError && styles.inputError]}
            value={rearPsiInput}
            onChangeText={setRearPsiInput}
            keyboardType="decimal-pad"
            placeholder="Rear PSI"
            placeholderTextColor={C.textTer}
          />
          <TouchableOpacity style={styles.logBtn} onPress={logPsi} activeOpacity={0.8}>
            <Text style={styles.logBtnText}>LOG</Text>
          </TouchableOpacity>
        </View>

        {pressureLog.length > 0 ? (
          <View style={styles.card}>
            {pressureLog.map((entry, i) => (
              <View key={i} style={[styles.pressureEntry, i < pressureLog.length - 1 && styles.logEntryBorder]}>
                <Text style={styles.logEntryDate}>{entry.date}</Text>
                <Text style={styles.pressureEntryValues}>
                  Front: <Text style={styles.pressureEntryNum}>{entry.front} PSI</Text>
                  {'  /  '}
                  Rear: <Text style={styles.pressureEntryNum}>{entry.rear} PSI</Text>
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyNote}>No pressure readings logged</Text>
        )}
        </CollapsibleSection>

        <Divider />

        {/* ── SERVICE LOG ── */}
        <CollapsibleSection title="SERVICE LOG" defaultOpen={false}>

        <View style={[styles.milestoneBadge, serviceNear && styles.milestoneBadgeAmber]}>
          <Text style={[styles.milestoneText, serviceNear && styles.milestoneTextAmber]}>
            NEXT SERVICE: {ns.toFixed(0)} mi{'  ·  '}{miToService.toFixed(0)} mi away
          </Text>
        </View>

        <TextInput
          style={styles.notesInput}
          value={serviceNotes}
          onChangeText={setServiceNotes}
          placeholder="Notes — e.g. Rear tire swap, chain lube, brake pads..."
          placeholderTextColor={C.textTer}
          multiline
          numberOfLines={2}
        />
        <TouchableOpacity style={styles.logServiceBtn} onPress={logService} activeOpacity={0.8}>
          <Text style={styles.logServiceBtnText}>LOG SERVICE EVENT</Text>
        </TouchableOpacity>

        {svcLog.length > 0 && (
          <View style={[styles.card, { marginTop: 10 }]}>
            {svcLog.map(({ entry, origIdx }, i) => (
              <View key={origIdx} style={[styles.svcEntry, i < svcLog.length - 1 && styles.logEntryBorder]}>
                <View style={styles.svcEntryTop}>
                  <Text style={styles.svcOdometer}>{entry.odometer.toFixed(1)} mi</Text>
                  <Text style={styles.logEntryDate}>{entry.date}</Text>
                  <TouchableOpacity
                    onPress={() => deleteServiceEntry(origIdx)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.entryDel}>✕</Text>
                  </TouchableOpacity>
                </View>
                {entry.notes ? <Text style={styles.svcNotes}>{entry.notes}</Text> : null}
              </View>
            ))}
          </View>
        )}
        {svcLog.length === 0 && <Text style={styles.emptyNote}>No service events logged</Text>}
        </CollapsibleSection>

        <Divider />

        {/* ── MOD LOG ── */}
        <CollapsibleSection
          title="MOD LOG"
          defaultOpen={true}
          right={
            <TouchableOpacity style={styles.logModBtn} onPress={openModModal} activeOpacity={0.7}>
              <Text style={styles.logModBtnText}>+ LOG MOD</Text>
            </TouchableOpacity>
          }
        >

        {modLog.length > 0 ? (
          modLog.map(mod => (
            <View key={mod.id} style={styles.modCard}>
              <View style={styles.modCardHeader}>
                <View style={[styles.modCategoryBadge, { backgroundColor: MOD_COLORS[mod.category].bg }]}>
                  <Text style={[styles.modCategoryText, { color: MOD_COLORS[mod.category].text }]}>
                    {mod.category.toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.modDate}>{mod.date}</Text>
                <TouchableOpacity
                  onPress={() => deleteModEntry(mod)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.entryDel}>✕</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.modComponent}>{mod.component}</Text>
              {mod.notes ? <Text style={styles.modNotes}>{mod.notes}</Text> : null}
            </View>
          ))
        ) : (
          <Text style={styles.emptyNote}>No mods logged</Text>
        )}
        </CollapsibleSection>

        <Divider />

        {/* ── AI ANALYSIS ── */}
        <CollapsibleSection title="AI ANALYSIS" defaultOpen={true}>

        {hasApiKey ? (
          <>
            <OpsButton icon="▶" label="PRE-MISSION CHECK" onPress={() => onMissionAction(OPS_PROMPTS['pre-mission'])} />
            <OpsButton icon="⚡" label="BMS CALIBRATION" onPress={() => onMissionAction(OPS_PROMPTS.bms)} />
            <OpsButton icon="🔧" label="SERVICE INTERVAL" onPress={() => onMissionAction(OPS_PROMPTS.service)} />
            <OpsButton icon="🎽" label="GEAR CHECK" onPress={() => onMissionAction(OPS_PROMPTS.gear)} />
            <OpsButton icon="📋" label="MISSION DEBRIEF" onPress={() => onMissionAction(OPS_PROMPTS.debrief)} />
          </>
        ) : (
          <View style={styles.unlockCard}>
            <Text style={styles.unlockIcon}>🔑</Text>
            <Text style={styles.unlockTitle}>Unlock AI Analysis</Text>
            <Text style={styles.unlockBody}>
              Pre-Mission Check, BMS Calibration, Service Interval, Gear Check, and Mission Debrief use live telemetry to give tactical guidance.
            </Text>
            <Text style={styles.unlockCta}>Add your Anthropic API key in the CHAT tab to activate.</Text>
          </View>
        )}
        </CollapsibleSection>

        <Divider />

        {/* ── BIKE PROFILE ── */}
        <CollapsibleSection title="BIKE PROFILE" defaultOpen={true}>

        <View style={styles.profileCard}>
          <Text style={styles.profileName}>{displayName}</Text>
          {state.nickname ? (
            <Text style={styles.profileSub}>{state.make} {state.model}</Text>
          ) : null}
        </View>

        <TouchableOpacity style={styles.dataBtn} onPress={onEditProfile} activeOpacity={0.7}>
          <Text style={styles.dataBtnIcon}>✎</Text>
          <View style={styles.dataBtnContent}>
            <Text style={styles.dataBtnLabel}>EDIT BIKE PROFILE</Text>
            <Text style={styles.dataBtnSub}>Update make, model, and nickname</Text>
          </View>
          <Text style={styles.dataBtnArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.dataBtn, styles.dataBtnDestructive]}
          onPress={handleResetBikeProfile}
          activeOpacity={0.7}
        >
          <Text style={[styles.dataBtnIcon, styles.dataBtnIconDestructive]}>⊘</Text>
          <View style={styles.dataBtnContent}>
            <Text style={[styles.dataBtnLabel, styles.dataBtnLabelDestructive]}>RESET BIKE PROFILE</Text>
            <Text style={styles.dataBtnSub}>Restore default make, model, and nickname</Text>
          </View>
          <Text style={styles.dataBtnArrow}>›</Text>
        </TouchableOpacity>

        </CollapsibleSection>

        <Divider />

        {/* ── DATA MANAGEMENT ── */}
        <CollapsibleSection title="DATA MANAGEMENT" defaultOpen={false}>

        <TouchableOpacity
          style={styles.dataBtn}
          onPress={handleExport}
          disabled={dataLoading !== null}
          activeOpacity={0.7}
        >
          {dataLoading === 'export' ? (
            <ActivityIndicator size="small" color={C.accent} />
          ) : (
            <Text style={styles.dataBtnIcon}>↑</Text>
          )}
          <View style={styles.dataBtnContent}>
            <Text style={styles.dataBtnLabel}>EXPORT DATA</Text>
            <Text style={styles.dataBtnSub}>Share full backup as JSON</Text>
          </View>
          <Text style={styles.dataBtnArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.dataBtn}
          onPress={handleImport}
          disabled={dataLoading !== null}
          activeOpacity={0.7}
        >
          {dataLoading === 'import' ? (
            <ActivityIndicator size="small" color={C.accent} />
          ) : (
            <Text style={styles.dataBtnIcon}>↓</Text>
          )}
          <View style={styles.dataBtnContent}>
            <Text style={styles.dataBtnLabel}>IMPORT DATA</Text>
            <Text style={styles.dataBtnSub}>Restore from a JSON backup file</Text>
          </View>
          <Text style={styles.dataBtnArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.dataBtn, styles.dataBtnDestructive]}
          onPress={handleReset}
          disabled={dataLoading !== null}
          activeOpacity={0.7}
        >
          <Text style={[styles.dataBtnIcon, styles.dataBtnIconDestructive]}>⊘</Text>
          <View style={styles.dataBtnContent}>
            <Text style={[styles.dataBtnLabel, styles.dataBtnLabelDestructive]}>RESET APP</Text>
            <Text style={styles.dataBtnSub}>Clear all data and restore defaults</Text>
          </View>
          <Text style={styles.dataBtnArrow}>›</Text>
        </TouchableOpacity>

        </CollapsibleSection>

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* ── LOG MOD MODAL ── */}
      <Modal visible={modModalVisible} transparent animationType="slide">
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setModModalVisible(false)}
        />
        <View style={styles.modalSheet}>
          <SafeAreaView>
            <View style={styles.modalHeader}>
              <TouchableOpacity
                onPress={() => setModModalVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>LOG MOD</Text>
              <TouchableOpacity
                onPress={saveMod}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.modalSave}>Save</Text>
              </TouchableOpacity>
            </View>

            <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
              {/* Category chips */}
              <View style={styles.modalSection}>
                <Text style={styles.modalLabel}>CATEGORY</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.categoryChips}
                >
                  {MOD_CATEGORIES.map(cat => (
                    <TouchableOpacity
                      key={cat}
                      style={[
                        styles.categoryChip,
                        modCategory === cat && {
                          backgroundColor: MOD_COLORS[cat].bg,
                          borderColor: MOD_COLORS[cat].text,
                        },
                      ]}
                      onPress={() => setModCategory(cat)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.categoryChipText,
                          modCategory === cat && { color: MOD_COLORS[cat].text, fontWeight: '700' },
                        ]}
                      >
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {modCategory === 'Tires' && (
                  <View style={styles.tireHint}>
                    <Text style={styles.tireHintText}>
                      ⚡ Component name will sync to BIKE tab tire spec
                    </Text>
                  </View>
                )}
              </View>

              {/* Component name */}
              <View style={styles.modalSection}>
                <Text style={styles.modalLabel}>COMPONENT NAME</Text>
                <TextInput
                  style={[styles.modalInput, modComponentError && styles.inputError]}
                  value={modComponent}
                  onChangeText={setModComponent}
                  placeholder={
                    modCategory === 'Tires' ? 'e.g. Kenda Juggernaut 26x4.0' : 'Component name...'
                  }
                  placeholderTextColor={C.textTer}
                  autoCorrect={false}
                />
              </View>

              {/* Notes */}
              <View style={styles.modalSection}>
                <Text style={styles.modalLabel}>NOTES (optional)</Text>
                <TextInput
                  style={[styles.modalInput, styles.modalNotesInput]}
                  value={modNotes}
                  onChangeText={setModNotes}
                  placeholder="Details about the mod..."
                  placeholderTextColor={C.textTer}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </View>

              {/* Date */}
              <View style={styles.modalSection}>
                <Text style={styles.modalLabel}>DATE</Text>
                <Text style={styles.modalDateText}>{formatDate()}</Text>
              </View>

              <View style={{ height: 16 }} />
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: C.bg },
  content: { padding: 12 },

  resetBtn: {
    fontFamily: MONO,
    fontSize: 8,
    letterSpacing: 1.5,
    color: C.textSec,
    textDecorationLine: 'underline',
  },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 12 },

  toggleStatus: { fontFamily: MONO, fontSize: 9, color: C.textTer },
  toggleStatusOn: { color: C.accent },

  rigCard: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    overflow: 'hidden',
  },
  rigField: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  rigFieldLabel: {
    fontFamily: MONO,
    fontSize: 8,
    letterSpacing: 1.5,
    color: C.textSec,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  rigInput: {
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontFamily: MONO,
    fontSize: 12,
    color: C.text,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: C.bg,
  },
  chipActive: { backgroundColor: C.accentBg, borderColor: C.accentDim },
  chipText: { fontFamily: MONO, fontSize: 10, color: C.textSec },
  chipTextActive: { color: C.accent, fontWeight: '700' },
  rigToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  progressTrack: { flex: 1, height: 4, backgroundColor: C.border, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4, backgroundColor: C.accent, borderRadius: 2 },
  progressLabel: { fontFamily: MONO, fontSize: 10, color: C.textSec, minWidth: 28, textAlign: 'right' },

  card: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    gap: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkboxChecked: { backgroundColor: C.accent, borderColor: C.accent },
  checkmark: { fontSize: 12, color: C.white, fontWeight: '700', lineHeight: 14 },
  checkContent: { flex: 1 },
  checkLabel: { fontFamily: MONO, fontSize: 11, color: C.text, fontWeight: '600' },
  checkLabelDone: { color: C.textTer, textDecorationLine: 'line-through' },
  checkSublabel: { fontFamily: MONO, fontSize: 9, color: C.textSec, marginTop: 1 },
  logInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  logInput: {
    flex: 1,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontFamily: MONO,
    fontSize: 13,
    color: C.text,
  },
  inputError: { borderColor: C.red },
  logInputUnit: { fontFamily: MONO, fontSize: 10, color: C.textSec },
  logBtn: {
    backgroundColor: C.accent,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  logBtnText: { fontFamily: MONO, fontSize: 11, fontWeight: '700', color: C.white, letterSpacing: 1 },

  logEntry: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7 },
  pressureEntry: { paddingVertical: 8 },
  pressureEntryValues: { fontFamily: MONO, fontSize: 11, color: C.textSec, marginTop: 2 },
  pressureEntryNum: { color: C.text, fontWeight: '700' },
  logEntryBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  logEntryValue: { fontFamily: MONO, fontSize: 13, fontWeight: '700', color: C.text },
  logEntryUnit: { fontSize: 10, fontWeight: '400', color: C.textSec },
  logEntryDate: { fontFamily: MONO, fontSize: 9, color: C.textSec },
  emptyNote: { fontFamily: MONO, fontSize: 10, color: C.textTer, marginBottom: 2 },

  milestoneBadge: {
    backgroundColor: C.accentBg,
    borderWidth: 1,
    borderColor: C.accentDim,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  milestoneBadgeAmber: { backgroundColor: C.amberBg, borderColor: 'rgba(255,149,0,0.3)' },
  milestoneText: { fontFamily: MONO, fontSize: 10, letterSpacing: 0.5, color: C.accent, fontWeight: '700' },
  milestoneTextAmber: { color: C.amber },

  notesInput: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontFamily: MONO,
    fontSize: 12,
    color: C.text,
    marginBottom: 8,
    minHeight: 52,
    textAlignVertical: 'top',
  },
  logServiceBtn: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.accent,
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
  },
  logServiceBtnText: { fontFamily: MONO, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, color: C.accent },

  entryDel: { fontFamily: MONO, fontSize: 12, color: C.red, paddingLeft: 8 },

  svcEntry: { paddingVertical: 8 },
  svcEntryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  svcOdometer: { fontFamily: MONO, fontSize: 12, fontWeight: '700', color: C.text },
  svcNotes: { fontFamily: MONO, fontSize: 10, color: C.textSec, lineHeight: 15 },

  // Mod log
  logModBtn: {
    backgroundColor: C.accentBg,
    borderWidth: 1,
    borderColor: C.accentDim,
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  logModBtnText: { fontFamily: MONO, fontSize: 9, fontWeight: '700', color: C.accent, letterSpacing: 1 },

  modCard: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    padding: 10,
    marginBottom: 6,
  },
  modCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  modCategoryBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  modCategoryText: {
    fontFamily: MONO,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1,
  },
  modDate: { fontFamily: MONO, fontSize: 9, color: C.textSec },
  modComponent: { fontFamily: MONO, fontSize: 12, fontWeight: '700', color: C.text, marginBottom: 2 },
  modNotes: { fontFamily: MONO, fontSize: 10, color: C.textSec, lineHeight: 15 },

  // AI section
  opsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 6,
  },
  opsBtnIcon: { fontSize: 14, width: 20, textAlign: 'center' },
  opsBtnLabel: { flex: 1, fontFamily: MONO, fontSize: 11, letterSpacing: 1, color: C.text, fontWeight: '600' },
  opsBtnArrow: { fontSize: 18, color: C.textTer },

  unlockCard: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    gap: 6,
  },
  unlockIcon: { fontSize: 22, marginBottom: 2 },
  unlockTitle: { fontFamily: MONO, fontSize: 12, fontWeight: '700', letterSpacing: 1, color: C.text },
  unlockBody: { fontSize: 12, color: C.textSec, textAlign: 'center', lineHeight: 18, marginTop: 2 },
  unlockCta: { fontFamily: MONO, fontSize: 10, color: C.accent, textAlign: 'center', marginTop: 4, letterSpacing: 0.3 },

  // Bike profile
  profileCard: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  profileName: { fontFamily: MONO, fontSize: 14, fontWeight: '700', color: C.text },
  profileSub: { fontFamily: MONO, fontSize: 10, color: C.textSec, marginTop: 2 },

  // Data management
  dataBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 6,
  },
  dataBtnDestructive: { borderColor: 'rgba(255,59,48,0.3)', backgroundColor: C.redBg },
  dataBtnIcon: { fontSize: 16, width: 20, textAlign: 'center', color: C.accent, fontWeight: '700' },
  dataBtnIconDestructive: { color: C.red },
  dataBtnContent: { flex: 1 },
  dataBtnLabel: { fontFamily: MONO, fontSize: 11, fontWeight: '700', letterSpacing: 1, color: C.text },
  dataBtnLabelDestructive: { color: C.red },
  dataBtnSub: { fontFamily: MONO, fontSize: 9, color: C.textSec, marginTop: 2 },
  dataBtnArrow: { fontSize: 18, color: C.textTer },

  // Modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  modalSheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    maxHeight: '78%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  modalTitle: { fontFamily: MONO, fontSize: 12, fontWeight: '700', letterSpacing: 1.5, color: C.text },
  modalCancel: { fontSize: 15, color: C.textSec },
  modalSave: { fontSize: 15, color: C.accent, fontWeight: '700' },

  modalSection: { paddingHorizontal: 16, paddingTop: 14 },
  modalLabel: {
    fontFamily: MONO,
    fontSize: 8,
    letterSpacing: 1.5,
    color: C.textSec,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  categoryChips: { gap: 6, paddingBottom: 2 },
  categoryChip: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: C.surface,
  },
  categoryChipText: { fontFamily: MONO, fontSize: 11, color: C.textSec },

  tireHint: {
    marginTop: 8,
    backgroundColor: C.accentBg,
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tireHintText: { fontFamily: MONO, fontSize: 9, color: C.accent, letterSpacing: 0.3 },

  modalInput: {
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontFamily: MONO,
    fontSize: 13,
    color: C.text,
  },
  modalNotesInput: { minHeight: 72, textAlignVertical: 'top' },
  modalDateText: { fontFamily: MONO, fontSize: 12, color: C.textSec },
});
