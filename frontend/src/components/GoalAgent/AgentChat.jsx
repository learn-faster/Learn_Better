import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Send, Bot, User, AlertTriangle, Gauge } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { agentApi } from '../../services/agent';
import CelestialBackground from './CelestialBackground';
import SolarCoreIcon from './SolarCoreIcon';

const AgentChat = ({ status, onOpenSettings }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isNegotiating, setIsNegotiating] = useState(false);
  const [saveState, setSaveState] = useState({});
  const endRef = useRef(null);
  const scrollRef = useRef(null);

  const scrollToBottomIfNearEnd = useCallback((behavior = 'auto') => {
    const container = scrollRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 180) {
      container.scrollTo({ top: container.scrollHeight, behavior });
    }
  }, []);

  useEffect(() => {
    scrollToBottomIfNearEnd('smooth');
  }, [messages, isLoading, scrollToBottomIfNearEnd]);

  const makeMessageId = (seed) => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    const randomPart = Math.random().toString(36).slice(2, 10);
    return `msg_${Date.now()}_${seed || randomPart}`;
  };

  const normalizeMessages = (history) => history.map((msg, idx) => ({
    ...msg,
    id: msg.id || makeMessageId(idx)
  }));

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const data = await agentApi.history();
        const history = normalizeMessages(data?.history || []);
        if (history.length > 0) {
          setMessages(history);
        } else {
          setMessages([
            { id: makeMessageId('welcome'), role: 'assistant', content: 'Hi! I’m your Goal Agent. Tell me what you want to achieve and I’ll build a plan.' }
          ]);
        }
      } catch {
        setMessages([
          { id: makeMessageId('welcome'), role: 'assistant', content: 'Hi! I’m your Goal Agent. Tell me what you want to achieve and I’ll build a plan.' }
        ]);
      }
    };
    loadHistory();
  }, []);

  const sendMessage = async (overrideText) => {
    const text = (overrideText ?? input).trim();
    if (!text || isLoading) return;
    const userMsg = { id: makeMessageId('user'), role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const data = await agentApi.chat({ message: userMsg.content });
      const agentMsg = {
        id: makeMessageId('agent'),
        role: 'assistant',
        content: data.message,
        guardrail: data.guardrail,
        suggested_actions: data.suggested_actions || [],
        tool_events: data.tool_events || []
      };
      setMessages((prev) => [...prev, agentMsg]);
    } catch (e) {
      setMessages((prev) => [...prev, { id: makeMessageId('error'), role: 'assistant', content: 'Sorry — something went wrong. Try again in a moment.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleQuickAction = (text) => {
    sendMessage(text);
  };

  const ensureSaveState = (messageId) => {
    setSaveState((prev) => {
      if (prev[messageId]) return prev;
      return {
        ...prev,
        [messageId]: {
          selected: [],
          duration: 30,
          targetDay: 'today',
          status: 'idle'
        }
      };
    });
  };

  const toggleActionSelection = (messageId, action) => {
    ensureSaveState(messageId);
    setSaveState((prev) => {
      const current = prev[messageId] || { selected: [], duration: 30, targetDay: 'today', status: 'idle' };
      const exists = current.selected.includes(action);
      const selected = exists
        ? current.selected.filter((a) => a !== action)
        : [...current.selected, action];
      return {
        ...prev,
        [messageId]: { ...current, selected }
      };
    });
  };

  const updateSaveConfig = (messageId, field, value) => {
    ensureSaveState(messageId);
    setSaveState((prev) => {
      const current = prev[messageId] || { selected: [], duration: 30, targetDay: 'today', status: 'idle' };
      return {
        ...prev,
        [messageId]: { ...current, [field]: value }
      };
    });
  };

  const handleSaveSelected = async (messageId) => {
    const current = saveState[messageId];
    if (!current || current.selected.length === 0) return;
    setSaveState((prev) => ({
      ...prev,
      [messageId]: { ...prev[messageId], status: 'saving' }
    }));

    const targetDate = (() => {
      const date = new Date();
      if (current.targetDay === 'tomorrow') {
        date.setDate(date.getDate() + 1);
      }
      return date.toISOString().slice(0, 10);
    })();

    try {
      await Promise.all(
        current.selected.map((action) =>
          agentApi.saveDailyPlanEntry({
            title: action,
            item_type: 'agent_action',
            duration_minutes: current.duration,
            notes: 'Saved from Goal Agent chat',
            date: targetDate
          })
        )
      );
      setSaveState((prev) => ({
        ...prev,
        [messageId]: { ...prev[messageId], status: 'saved' }
      }));
    } catch (e) {
      setSaveState((prev) => ({
        ...prev,
        [messageId]: { ...prev[messageId], status: 'error' }
      }));
    }
  };

  const handleNegotiate = async () => {
    if (isNegotiating) return;
    setIsNegotiating(true);
    try {
      const data = await agentApi.negotiateSummary();
      const pacing = data?.pacing || [];
      if (pacing.length === 0) {
        setMessages((prev) => [...prev, { role: 'assistant', content: 'No active goals found to negotiate yet.' }]);
      } else {
        const lines = pacing.map((p) => {
          const days = p.days_remaining ?? '—';
          const hours = p.required_daily_hours ?? '—';
          return `• ${p.title}: days remaining ${days}, required daily hours ${hours}`;
        });
        const msg = `Here is your current pacing:\n\n${lines.join('\n')}\n\nTell me the timeline you want, and I’ll rebalance the plan.`;
        setMessages((prev) => [...prev, { role: 'assistant', content: msg }]);
      }
    } catch (e) {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Unable to recalculate pacing right now.' }]);
    } finally {
      setIsNegotiating(false);
    }
  };

  return (
    <div className="h-full flex flex-col relative">
      <CelestialBackground className="absolute inset-0 opacity-70" />

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-6 space-y-4 custom-scrollbar relative z-10">
        <div className="w-full space-y-4">
          <div className="flex items-center justify-between text-xs text-dark-400">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.25em] text-amber-200/70">Agent Channel</span>
              {status?.email_configured ? (
                <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-200">Email ready</span>
              ) : (
                <span className="text-[10px] px-2 py-1 rounded-full bg-amber-500/15 text-amber-200">Email missing</span>
              )}
            </div>
            {!status?.email_configured && (
              <button onClick={onOpenSettings} className="text-amber-200 hover:text-amber-100 text-[11px] font-semibold">Set it up</button>
            )}
          </div>

          <div className="rounded-[24px] bg-dark-950/60 border border-white/10 shadow-[0_0_32px_rgba(0,0,0,0.35)] p-4 space-y-4">
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                onQuickAction={handleQuickAction}
                saveConfig={saveState[msg.id]}
                onToggleAction={(action) => toggleActionSelection(msg.id, action)}
                onSaveSelected={() => handleSaveSelected(msg.id)}
                onUpdateSaveConfig={(field, value) => updateSaveConfig(msg.id, field, value)}
              />
            ))}
            {isLoading && (
              <div className="flex items-center gap-2 text-xs text-dark-400">
                <Bot className="w-4 h-4" /> Thinking...
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>
      </div>

      <div className="px-5 pb-5 relative z-10">
        <div className="w-full rounded-[22px] bg-dark-950/70 border border-white/10 p-4 shadow-[0_0_32px_rgba(0,0,0,0.35)]">
          <div className="mb-2 flex items-center justify-between">
            <button
              onClick={handleNegotiate}
              disabled={isNegotiating}
              className="flex items-center gap-2 text-[11px] px-3 py-2 rounded-full bg-white/5 text-amber-200 hover:bg-white/10 disabled:opacity-40"
            >
              <Gauge className="w-3.5 h-3.5" />
              Recalculate pacing
            </button>
            <span className="text-[10px] text-dark-500">Ask for a faster or lighter timeline</span>
          </div>
          <div className="relative">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about goals, schedules, or study plans..."
              className="w-full pr-20 pl-4 py-2.5 rounded-full bg-dark-900/70 border border-amber-500/20 text-sm text-white placeholder:text-dark-500 focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/20"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-full bg-amber-500 hover:bg-amber-400 text-[11px] font-semibold text-white disabled:opacity-40"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="mt-1.5 text-[10px] text-dark-500">Guardrails are enabled — I stay focused on your goals.</div>
        </div>
      </div>
    </div>
  );
};

const stripThinking = (content = '') => {
  const thinkBlock = /<think>[\s\S]*?<\/think>/gi;
  const reasoningBlock = /(^|\n)(?:THINKING|REASONING|INTERNAL):[\s\S]*$/i;
  let found = false;
  const extracted = [];
  let cleaned = content.replace(thinkBlock, (match) => {
    found = true;
    extracted.push(match);
    return '';
  });
  if (reasoningBlock.test(cleaned)) {
    found = true;
    const match = cleaned.match(reasoningBlock);
    if (match && match[0]) extracted.push(match[0]);
    cleaned = cleaned.replace(reasoningBlock, '');
  }
  const hidden = extracted.join('\n').trim();
  return { text: cleaned.trim(), hadThinking: found, hidden };
};

const MessageBubble = ({ message, onQuickAction, saveConfig, onToggleAction, onSaveSelected, onUpdateSaveConfig }) => {
  const isUser = message.role === 'user';
  const hasActions = Array.isArray(message.suggested_actions) && message.suggested_actions.length > 0;
  const selectedCount = saveConfig?.selected?.length || 0;
  const { text, hadThinking, hidden } = stripThinking(message.content || '');
  const [showReasoning, setShowReasoning] = useState(false);
  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="w-9 h-9 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shadow-[0_0_24px_rgba(251,191,36,0.35)]">
          <SolarCoreIcon size={22} />
        </div>
      )}
      <div className={`max-w-[70%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${isUser ? 'bg-amber-500/15 text-amber-100 border border-amber-500/30' : 'bg-dark-900/70 border border-amber-500/20 text-white shadow-[0_0_30px_rgba(251,191,36,0.12)] agent-stardust'}`}>
        {message.guardrail?.status === 'out_of_domain' && (
          <div className="mb-2 text-[11px] text-amber-300 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Outside goal scope — I’ll steer back to your learning.
          </div>
        )}
        <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-li:my-1 prose-ul:my-2 prose-ol:my-2 prose-strong:text-amber-100 prose-code:text-amber-200 prose-code:bg-white/5 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-dark-950/80 prose-pre:border prose-pre:border-white/10 prose-pre:rounded-xl prose-pre:p-3 prose-pre:shadow-[0_0_20px_rgba(0,0,0,0.3)] agent-chat-content">
          <ReactMarkdown>
            {text || message.content}
          </ReactMarkdown>
        </div>
        {hadThinking && !isUser && (
          <div className="mt-2 text-[11px] text-dark-400">
            <button
              onClick={() => setShowReasoning((v) => !v)}
              className="text-amber-200 hover:text-amber-100 underline underline-offset-2"
            >
              {showReasoning ? 'Hide reasoning' : 'Show reasoning'}
            </button>
          </div>
        )}
        {showReasoning && hidden && !isUser && (
          <div className="mt-2 text-[11px] text-dark-300 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
            <pre className="whitespace-pre-wrap">{hidden}</pre>
          </div>
        )}
        {Array.isArray(message.tool_events) && message.tool_events.length > 0 && (
          <div className="mt-3 space-y-2">
            {message.tool_events.map((evt, idx) => (
              <div key={idx} className="text-[11px] rounded-lg bg-white/5 border border-white/10 px-2 py-1">
                <span className="text-primary-300">{evt.type}</span>: {evt.status}
              </div>
            ))}
          </div>
        )}
        {Array.isArray(message.suggested_actions) && message.suggested_actions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {message.suggested_actions.map((action, idx) => (
              <button
                key={idx}
                onClick={() => onQuickAction(action)}
                className="text-[10px] px-2 py-1 rounded-full bg-amber-500/20 text-amber-200 hover:bg-amber-500/30"
              >
                {action}
              </button>
            ))}
          </div>
        )}
        {hasActions && (
          <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-white">Save actions</p>
                <p className="text-[11px] text-dark-400">Pick what you want and drop it into your daily plan.</p>
              </div>
              <button
                onClick={onSaveSelected}
                disabled={selectedCount === 0 || saveConfig?.status === 'saving'}
                className="text-[11px] px-3 py-1.5 rounded-full bg-primary-500/20 text-primary-200 hover:bg-primary-500/30 disabled:opacity-50"
              >
                {saveConfig?.status === 'saving' ? 'Saving...' : 'Save selected'}
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {message.suggested_actions.map((action, idx) => {
                const checked = saveConfig?.selected?.includes(action);
                return (
                  <label key={`save-${idx}`} className="flex items-center gap-2 text-[11px] text-dark-200">
                    <input
                      type="checkbox"
                      checked={!!checked}
                      onChange={() => onToggleAction(action)}
                      className="w-3.5 h-3.5 text-primary-500 rounded border-white/20"
                    />
                    <span>{action}</span>
                  </label>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <select
                value={saveConfig?.targetDay || 'today'}
                onChange={(e) => onUpdateSaveConfig('targetDay', e.target.value)}
                className="text-[11px] rounded-lg bg-dark-900/70 border border-white/10 text-white px-2 py-1"
              >
                <option value="today">Today</option>
                <option value="tomorrow">Tomorrow</option>
              </select>
              <select
                value={saveConfig?.duration || 30}
                onChange={(e) => onUpdateSaveConfig('duration', Number(e.target.value))}
                className="text-[11px] rounded-lg bg-dark-900/70 border border-white/10 text-white px-2 py-1"
              >
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
                <option value={45}>45 min</option>
                <option value={60}>60 min</option>
              </select>
              <span className="ml-auto text-[10px] text-dark-500">Duration per task</span>
            </div>
            {saveConfig?.status === 'saved' && (
              <div className="text-[11px] text-emerald-300">Saved to Daily Goals.</div>
            )}
            {saveConfig?.status === 'error' && (
              <div className="text-[11px] text-amber-300">Unable to save right now.</div>
            )}
          </div>
        )}
      </div>
      {isUser && (
        <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-200 flex items-center justify-center">
          <User className="w-4 h-4" />
        </div>
      )}
    </div>
  );
};

export default AgentChat;
