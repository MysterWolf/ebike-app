import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { AppState, DEFAULT_STATE, Message, Tab } from '../state/types';
import { saveState, loadState } from '../utils/storage';
import { callAPI, nowTime, WELCOME_MESSAGE } from '../utils/ai';
import { requestNotificationPermission, isPreflightScheduled, schedulePreflightNotification } from '../utils/NotificationService';
import { useBleContext } from '../context/BleContext';

import { SetupWizard } from '../components/SetupWizard';
import { EditBikeScreen } from './EditBikeScreen';
import { Header } from '../components/Header';
import { MetricsRows } from '../components/MetricsRows';
import { TabBar } from '../components/TabBar';
import { RideTab } from '../components/tabs/RideTab';
import { BikeTab } from '../components/tabs/BikeTab';
import { GearTab } from '../components/tabs/GearTab';
import { OpsTab } from '../components/tabs/OpsTab';
import { ChatPanel } from '../components/chat/ChatPanel';

export function MissionControlScreen({ initialTab }: { initialTab?: Tab }) {
  const { C } = useTheme();
  const [state, setStateRaw] = useState<AppState>(DEFAULT_STATE);
  const [activeTab, setActiveTab] = useState<Tab>(initialTab ?? 'ride');
  const [isTyping, setIsTyping] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);

  const { setRideMode, status, lastKnownBlePct, lastRideLoggedAt } = useBleContext();
  const prevBleStatus = useRef(status);

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    loading:   { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.background },
    content:   { flex: 1 },
  }), [C]);

  useEffect(() => {
    loadState().then(saved => {
      if (saved) {
        const merged: AppState = { ...DEFAULT_STATE, ...saved };
        setRideMode(merged.rideMode);
        setStateRaw(merged);
        const sysMsg: Message = {
          role: 'system',
          content: '📡 Telemetry restored — all systems nominal.',
          time: nowTime(),
        };
        if (!merged.messages || merged.messages.length === 0) {
          setStateRaw(s => ({
            ...s,
            messages: [{ role: 'assistant', content: WELCOME_MESSAGE, time: nowTime() }],
          }));
        } else {
          setStateRaw(s => ({ ...s, messages: [...merged.messages, sysMsg] }));
        }
      } else {
        setStateRaw(s => ({
          ...s,
          messages: [{ role: 'assistant', content: WELCOME_MESSAGE, time: nowTime() }],
        }));
        setShowWizard(true);
      }
      setLoaded(true);
    }).catch(err => {
      console.error('[MCS] loadState error:', err);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!loaded) return;
    async function notifStartup() {
      if (!state.hasAskedNotifPermission) {
        await requestNotificationPermission();
        update({ hasAskedNotifPermission: true });
      }
      if (state.preflightNotifEnabled) {
        const scheduled = await isPreflightScheduled();
        if (!scheduled) schedulePreflightNotification(state.preflightNotifHour, state.preflightNotifMinute);
      }
    }
    notifStartup();
  }, [loaded]);

  const update = useCallback((updates: Partial<AppState>) => {
    if (updates.rideMode !== undefined) setRideMode(updates.rideMode);
    setStateRaw(prev => {
      const next = { ...prev, ...updates };
      saveState(next);
      return next;
    });
  }, [setRideMode]);

  const addMessage = useCallback((msg: Message) => {
    setStateRaw(prev => {
      const next = { ...prev, messages: [...prev.messages, msg] };
      saveState(next);
      return next;
    });
  }, []);

  // Reload rideLog into state after BleContext auto-saves a ride to the DB
  useEffect(() => {
    if (!lastRideLoggedAt || !loaded) return;
    loadState().then(saved => {
      if (saved) setStateRaw(prev => ({ ...prev, rideLog: saved.rideLog }));
    }).catch(err => console.error('[MCS] rideLog reload:', err));
  }, [lastRideLoggedAt, loaded, update]);

  // Sync BLE battery reading into state.battery on disconnect so the
  // metrics tile and all calculations stay accurate without manual re-entry
  useEffect(() => {
    if (
      prevBleStatus.current === 'connected' &&
      (status === 'disconnected' || status === 'error') &&
      lastKnownBlePct !== null && lastKnownBlePct > 0
    ) {
      update({ battery: lastKnownBlePct });
    }
    prevBleStatus.current = status;
  }, [status, lastKnownBlePct, update]);

  const sendMessage = useCallback(
    async (text: string) => {
      const userMsg: Message = { role: 'user', content: text, time: nowTime() };

      let currentMessages: Message[] = [];
      setStateRaw(prev => {
        currentMessages = prev.messages;
        const next = { ...prev, messages: [...prev.messages, userMsg] };
        saveState(next);
        return next;
      });

      setIsTyping(true);

      try {
        const reply = await callAPI(text, state, currentMessages);
        const assistantMsg: Message = { role: 'assistant', content: reply, time: nowTime() };
        setStateRaw(prev => {
          const next = { ...prev, messages: [...prev.messages, assistantMsg] };
          saveState(next);
          return next;
        });
      } catch (err: any) {
        const errMsg: Message = {
          role: 'assistant',
          content: `**Connection error:** ${err?.message || 'Unknown error'}`,
          time: nowTime(),
        };
        setStateRaw(prev => {
          const next = { ...prev, messages: [...prev.messages, errMsg] };
          saveState(next);
          return next;
        });
      }

      setIsTyping(false);
    },
    [state]
  );

  function handleWizardComplete(values: Partial<AppState>) {
    setStateRaw(prev => {
      const next = { ...prev, ...values };
      saveState(next);
      return next;
    });
    setShowWizard(false);
  }

  function handleOpsAction(text: string) {
    sendMessage(text);
    setActiveTab('chat');
  }

  function handleReset() {
    const fresh: AppState = {
      ...DEFAULT_STATE,
      apiKey: state.apiKey,
      messages: [{ role: 'assistant', content: WELCOME_MESSAGE, time: nowTime() }],
    };
    setStateRaw(fresh);
    saveState(fresh);
  }

  function handleSysMsg(content: string) {
    addMessage({ role: 'system', content, time: nowTime() });
  }

  if (!loaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={C.accent} />
      </View>
    );
  }

  if (showWizard) {
    return <SetupWizard onComplete={handleWizardComplete} />;
  }

  if (showEditProfile) {
    return (
      <EditBikeScreen
        state={state}
        update={update}
        onBack={() => setShowEditProfile(false)}
      />
    );
  }

  return (
    <View style={styles.container}>
      <Header make={state.make} model={state.model} nickname={state.nickname} />
      <MetricsRows state={state} />
      <TabBar active={activeTab} onSelect={setActiveTab} />

      <View style={styles.content}>
        {activeTab === 'ride' && (
          <RideTab state={state} update={update} onSysMsg={handleSysMsg} />
        )}
        {activeTab === 'bike' && (
          <BikeTab state={state} update={update} />
        )}
        {activeTab === 'gear' && (
          <GearTab state={state} update={update} />
        )}
        {activeTab === 'ops' && (
          <OpsTab
              state={state}
              update={update}
              onMissionAction={handleOpsAction}
              onReset={handleReset}
              onEditProfile={() => setShowEditProfile(true)}
            />
        )}
        {activeTab === 'chat' && (
          <ChatPanel
            state={state}
            update={update}
            isTyping={isTyping}
            onSend={sendMessage}
          />
        )}
      </View>
    </View>
  );
}
