import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { C, MONO } from '../../theme/colors';
import { AppState, Message } from '../../state/types';
import { QUICK_QUERIES } from '../../utils/ai';

interface Props {
  state: AppState;
  update: (u: Partial<AppState>) => void;
  isTyping: boolean;
  onSend: (text: string) => void;
}

function renderMarkdown(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <Text key={i} style={{ fontWeight: '700', color: C.accent }}>
          {part.slice(2, -2)}
        </Text>
      );
    }
    return <Text key={i}>{part}</Text>;
  });
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  const isSystem = msg.role === 'system';

  return (
    <View style={[styles.msgWrap, isUser && styles.msgWrapUser]}>
      <View
        style={[
          styles.bubble,
          isUser ? styles.bubbleUser : styles.bubbleAssistant,
          isSystem && styles.bubbleSystem,
        ]}
      >
        {isSystem ? (
          <Text style={[styles.bubbleText, styles.systemText]}>{msg.content}</Text>
        ) : (
          <Text style={styles.bubbleText}>{renderMarkdown(msg.content)}</Text>
        )}
      </View>
      <Text style={[styles.msgTime, isUser && styles.msgTimeUser]}>{msg.time}</Text>
    </View>
  );
}

function TypingIndicator() {
  const d1 = useRef(new Animated.Value(0)).current;
  const d2 = useRef(new Animated.Value(0)).current;
  const d3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const dot = (d: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(d, { toValue: -5, duration: 300, useNativeDriver: true }),
          Animated.timing(d, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.delay(Math.max(0, 600 - delay)),
        ])
      );
    Animated.parallel([dot(d1, 0), dot(d2, 200), dot(d3, 400)]).start();
    return () => { d1.stopAnimation(); d2.stopAnimation(); d3.stopAnimation(); };
  }, [d1, d2, d3]);

  return (
    <View style={styles.typingWrap}>
      <View style={styles.typingBubble}>
        {[d1, d2, d3].map((d, i) => (
          <Animated.View
            key={i}
            style={[styles.typingDot, { transform: [{ translateY: d }] }]}
          />
        ))}
      </View>
    </View>
  );
}

export function ChatPanel({ state, update, isTyping, onSend }: Props) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  const apiKeySet = state.apiKey && state.apiKey.length > 10;
  const apiKeyValid = apiKeySet && state.apiKey.startsWith('sk-ant');
  const dotColor = apiKeyValid ? C.accent : apiKeySet ? C.amber : C.textTer;

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [state.messages, isTyping]);

  function send() {
    const text = input.trim();
    if (!text || isTyping) return;
    setInput('');
    onSend(text);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* API Key row */}
      <View style={styles.apiRow}>
        <Text style={styles.apiLabel}>API KEY</Text>
        <TextInput
          style={styles.apiInput}
          value={state.apiKey}
          onChangeText={v => update({ apiKey: v })}
          placeholder="sk-ant-api03-..."
          placeholderTextColor={C.textTer}
          secureTextEntry
          autoCorrect={false}
          autoCapitalize="none"
        />
        <View style={[styles.apiDot, { backgroundColor: dotColor }]} />
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        style={styles.messages}
        contentContainerStyle={styles.messagesContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {state.messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} />
        ))}
        {isTyping && <TypingIndicator />}
      </ScrollView>

      {/* Quick queries */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.quickScroll}
        contentContainerStyle={styles.quickContent}
      >
        {Object.entries(QUICK_QUERIES).map(([key, query]) => (
          <TouchableOpacity
            key={key}
            style={styles.quickBtn}
            onPress={() => onSend(query)}
            activeOpacity={0.7}
          >
            <Text style={styles.quickLabel}>
              {key.charAt(0).toUpperCase() + key.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Input bar */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.chatInput}
          value={input}
          onChangeText={setInput}
          placeholder="Ask the analyst..."
          placeholderTextColor={C.textTer}
          multiline
          returnKeyType="send"
          onSubmitEditing={send}
          blurOnSubmit={false}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || isTyping) && styles.sendBtnDisabled]}
          onPress={send}
          disabled={!input.trim() || isTyping}
          activeOpacity={0.8}
        >
          <Text style={styles.sendLabel}>SEND</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  apiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  apiLabel: {
    fontFamily: MONO,
    fontSize: 9,
    color: C.textSec,
    letterSpacing: 0.5,
  },
  apiInput: {
    flex: 1,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    fontFamily: MONO,
    fontSize: 11,
    color: C.text,
  },
  apiDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  messages: { flex: 1 },
  messagesContent: {
    padding: 12,
    gap: 8,
  },
  msgWrap: {
    maxWidth: '85%',
    alignSelf: 'flex-start',
    gap: 3,
  },
  msgWrapUser: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubble: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  bubbleUser: {
    backgroundColor: C.accentBg,
    borderWidth: 1,
    borderColor: C.accentDim,
  },
  bubbleAssistant: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  bubbleSystem: {
    backgroundColor: C.accentBg,
    borderWidth: 1,
    borderColor: C.accentDim,
  },
  bubbleText: {
    fontSize: 13,
    lineHeight: 19,
    color: C.text,
  },
  systemText: {
    fontFamily: MONO,
    fontSize: 11,
    color: C.accent,
  },
  msgTime: {
    fontFamily: MONO,
    fontSize: 9,
    color: C.textTer,
    marginLeft: 4,
  },
  msgTimeUser: { marginLeft: 0, marginRight: 4 },
  typingWrap: { alignSelf: 'flex-start' },
  typingBubble: {
    flexDirection: 'row',
    gap: 5,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: C.textSec,
  },
  quickScroll: {
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderTopColor: C.border,
    maxHeight: 44,
  },
  quickContent: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
    flexDirection: 'row',
  },
  quickBtn: {
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  quickLabel: {
    fontFamily: MONO,
    fontSize: 11,
    color: C.textSec,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  chatInput: {
    flex: 1,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: C.text,
    lineHeight: 20,
    minHeight: 40,
  maxHeight: 80,
  },
  sendBtn: {
    backgroundColor: C.accent,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.35 },
  sendLabel: {
    fontFamily: MONO,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: C.white,
  },
});
