import React, { useEffect, useMemo, useState } from 'react';
import { MessageSquare, Sparkles, Settings as SettingsIcon, X, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import AgentChat from './AgentChat';
import AgentOnboarding from './AgentOnboarding';
import AgentSettings from './AgentSettings';
import AgentWelcome from './AgentWelcome';
import { agentApi } from '../../services/agent';

const ONBOARDING_KEY = 'agent_onboarding_complete';

const AgentDock = () => {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('chat');
  const [status, setStatus] = useState(null);
  const [showOnboardingBar, setShowOnboardingBar] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);

  const refreshStatus = async () => {
    try {
      const data = await agentApi.status();
      setStatus(data);
    } catch (e) {
      console.error('Failed to load agent status', e);
    }
  };

  useEffect(() => {
    refreshStatus();
    const hasOnboarded = localStorage.getItem(ONBOARDING_KEY) === 'true';
    setShowOnboardingBar(!hasOnboarded);
    setShowWelcome(!hasOnboarded);
  }, []);

  const badges = useMemo(() => {
    if (!status) return [];
    const items = [];
    items.push({ label: status.email_configured ? 'Email ready' : 'Email missing', ok: status.email_configured });
    items.push({ label: status.fitbit_connected ? 'Fitbit connected' : 'Fitbit optional', ok: status.fitbit_connected });
    return items;
  }, [status]);

  const startOnboarding = () => {
    setOpen(true);
    setActiveTab('onboarding');
    setShowWelcome(false);
  };

  const handleOnboardingComplete = () => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    setShowOnboardingBar(false);
    setShowWelcome(false);
    refreshStatus();
    setActiveTab('chat');
  };

  return (
    <>
      {showWelcome && (
        <AgentWelcome
          onStart={startOnboarding}
          onSkip={() => setShowWelcome(false)}
        />
      )}
      <AnimatePresence>
        {showOnboardingBar && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            className="fixed bottom-24 right-6 z-[120] max-w-sm"
          >
            <div className="rounded-2xl border border-white/10 bg-dark-900/90 backdrop-blur-xl shadow-2xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-indigo-500 flex items-center justify-center text-white">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-white">Let’s personalize your learning</p>
                  <p className="text-xs text-dark-400 mt-1">Answer a few questions so I can build your goal‑aligned plan.</p>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={startOnboarding}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg bg-primary-500/90 hover:bg-primary-500 text-white"
                    >
                      Start
                    </button>
                    <button
                      onClick={() => setShowOnboardingBar(false)}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg bg-white/5 hover:bg-white/10 text-dark-300"
                    >
                      Later
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => setShowOnboardingBar(false)}
                  className="text-dark-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating launcher */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-4 right-4 md:bottom-6 md:right-6 z-[120] w-11 h-11 md:w-12 md:h-12 rounded-2xl shadow-lg shadow-primary-500/30 flex items-center justify-center text-white hover:scale-[1.03] transition-transform agent-orb overflow-hidden"
        style={{
          right: 'max(24px, env(safe-area-inset-right))',
          bottom: 'max(24px, env(safe-area-inset-bottom))'
        }}
        title="Open Goal Agent"
      >
        {open ? (
          <ChevronUp className="w-5 h-5" />
        ) : (
          <span className="agent-orb-shell">
            <span className="agent-orb-halo" />
            <span className="agent-orb-aurora" />
            <span className="agent-orb-ring" />
            <span className="agent-orb-core" />
            <span className="agent-orb-star agent-orb-star-1" />
            <span className="agent-orb-star agent-orb-star-2" />
            <span className="agent-orb-star agent-orb-star-3" />
            <span className="agent-orb-star agent-orb-star-4" />
          </span>
        )}
      </button>

      {/* Drawer */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 30 }}
            className="fixed bottom-20 right-6 z-[110] w-[440px] md:w-[460px] max-w-[94vw] h-[76vh] rounded-[28px] bg-dark-950/95 backdrop-blur-xl border border-white/10 shadow-2xl overflow-hidden flex flex-col agent-dock-panel"
          >
            <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white tracking-wide">Goal Agent</p>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    {badges.map((b, idx) => (
                      <span
                        key={idx}
                        className={`text-[10px] px-2 py-1 rounded-full ${b.ok ? 'bg-emerald-500/15 text-emerald-200' : 'bg-amber-500/15 text-amber-200'}`}
                      >
                        {b.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="text-dark-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-3 border-b border-white/5 flex gap-2">
              <TabButton label="Chat" icon={MessageSquare} active={activeTab === 'chat'} onClick={() => setActiveTab('chat')} />
              <TabButton label="Onboarding" icon={Sparkles} active={activeTab === 'onboarding'} onClick={() => setActiveTab('onboarding')} />
              <TabButton label="Settings" icon={SettingsIcon} active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
            </div>

            <div className="flex-1 min-h-0">
              {activeTab === 'chat' && <AgentChat status={status} onOpenSettings={() => setActiveTab('settings')} />}
              {activeTab === 'onboarding' && (
                <AgentOnboarding onComplete={handleOnboardingComplete} onOpenSettings={() => setActiveTab('settings')} />
              )}
              {activeTab === 'settings' && <AgentSettings onSaved={refreshStatus} />}
            </div>

            <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between text-[10px] text-dark-500">
              <span>Guardrails: Soft domain</span>
              <button onClick={startOnboarding} className="text-primary-300 hover:text-primary-200">Rerun onboarding</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

const TabButton = ({ label, icon: Icon, active, onClick }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${active ? 'bg-primary-500/20 text-primary-200 border border-primary-500/30' : 'text-dark-400 hover:text-white hover:bg-white/5 border border-transparent'}`}
  >
    <Icon className="w-3.5 h-3.5" />
    {label}
  </button>
);

export default AgentDock;
