import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { C } from '../theme/colors';
import { AppState, DEFAULT_STATE, Message, Tab } from '../state/types';
import { saveState, loadState } from '../utils/storage';
import { callAPI, nowTime, WELCOME_MESSAGE } from '../utils/ai';

import { SetupWizard } from '../components/SetupWizard';
import { Header } from '../components/Header';
import { MetricsRows } from '../components/MetricsRows';
import { TabBar } from '../components/TabBar';
import { RideTab } from '../components/tabs/RideTab';
import { BikeTab } from '../components/tabs/BikeTab';
import { GearTab } from '../components/tabs/GearTab';
import { OpsTab } from '../components/tabs/OpsTab';
import { ChatPanel } from '../components/chat/ChatPanel';

export function MissionControlScreen() {
  const [state, setStateRaw] = useState<AppState>(DEFAULT_STATE);
  const [activeTab, setActiveTab] = useState<Tab>('ride');
  const [isTyping, setIsTyping] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [showWizard, setShowWizard] = useState(false);

  useEffect(() => {
    loadState().then(saved => {
      if (saved) {
        const merged: AppState = { ...DEFAULT_STATE, ...saved };
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

  const update = useCallback((updates: Partial<AppState>) => {
    setStateRaw(prev => {
      const next = { ...prev, ...updates };
      saveState(next);
      return next;
    });
  }, []);

  const addMessage = useCallback((msg: Message) => {
    setStateRaw(prev => {
      const next = { ...prev, messages: [...prev.messages, msg] };
      saveState(next);
      return next;
    });
  }, []);

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

  return (
    <View style={styles.container}>
      <Header make={state.make} />
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
          <OpsTab state={state} update={update} onMissionAction={handleOpsAction} onReset={handleReset} />
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  content: { flex: 1 },
});
