import React, { useEffect, useMemo, useState } from 'react';
import { MessageSquare, Sparkles, Settings as SettingsIcon, X, ChevronUp, Maximize2, Minimize2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import AgentChat from './AgentChat';
import AgentOnboarding from './AgentOnboarding';
import AgentSettings from './AgentSettings';
import AgentWelcome from './AgentWelcome';
import { agentApi } from '../../services/agent';
import SolarCoreIcon from './SolarCoreIcon';

const ONBOARDING_KEY = 'agent_onboarding_complete';
const WELCOME_DISMISSED_KEY = 'agent_welcome_dismissed';
const DEEP_SPACE_MODE_KEY = 'agent_deep_space_mode';

const AgentDock = () => {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('chat');
  const [status, setStatus] = useState(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

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
    const welcomeDismissed = localStorage.getItem(WELCOME_DISMISSED_KEY) === 'true';
    setShowWelcome(!hasOnboarded && !welcomeDismissed);
    const storedMode = localStorage.getItem(DEEP_SPACE_MODE_KEY);
    if (storedMode === 'fullscreen') {
      setIsFullscreen(true);
    } else if (storedMode === 'modal') {
      setIsFullscreen(false);
    }
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

  const openWelcome = () => {
    setShowWelcome(true);
  };

  const toggleFullscreen = () => {
    setIsFullscreen((prev) => {
      const next = !prev;
      localStorage.setItem(DEEP_SPACE_MODE_KEY, next ? 'fullscreen' : 'modal');
      return next;
    });
  };

  const handleOnboardingComplete = () => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    setShowWelcome(false);
    refreshStatus();
    setActiveTab('chat');
  };

  const panelClass = isFullscreen
    ? 'fixed inset-0'
    : 'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(1100px,92vw)] h-[min(82vh,860px)]';

  return (
    <div className="agent-grav-area">
      {showWelcome && (
        <AgentWelcome
          onStart={startOnboarding}
          onSkip={() => {
            localStorage.setItem(WELCOME_DISMISSED_KEY, 'true');
            setShowWelcome(false);
          }}
        />
      )}
      <AnimatePresence />

      {/* Floating launcher */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-4 right-4 md:bottom-6 md:right-6 z-[120] w-14 h-14 md:w-16 md:h-16 rounded-full shadow-lg shadow-black/50 flex items-center justify-center text-white transition-transform agent-launcher agent-grav-target overflow-hidden"
        style={{
          right: 'max(24px, env(safe-area-inset-right))',
          bottom: 'max(24px, env(safe-area-inset-bottom))'
        }}
        title="Open Goal Agent"
      >
        {open ? (
          <ChevronUp className="w-5 h-5" />
        ) : (
          <SolarCoreIcon size={48} />
        )}
      </button>

      {/* Deep Space Modal */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[105] bg-dark-950/80 backdrop-blur-xl"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              className={`${panelClass} z-[110] ${isFullscreen ? 'rounded-none' : 'rounded-[36px]'} bg-dark-950/95 backdrop-blur-2xl border border-white/10 shadow-[0_0_80px_rgba(194,239,179,0.2)] overflow-hidden flex flex-col agent-dock-panel agent-grav-target`}
            >
              <div className="px-6 py-3 border-b border-white/5 flex items-center justify-between gap-4 agent-grav-pull">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-dark-950/80 flex items-center justify-center text-white shadow-lg shadow-black/40 border border-white/5">
                    <SolarCoreIcon size={30} />
                  </div>
                  <div className="flex flex-col">
                    <p className="text-xs font-semibold text-white tracking-wide">Goal Agent</p>
                    <div className="flex flex-wrap items-center gap-2">
                      {badges.map((b, idx) => (
                        <span
                          key={idx}
                          className={`text-[9px] px-2 py-0.5 rounded-full ${b.ok ? 'bg-primary-500/15 text-primary-200' : 'bg-primary-400/15 text-primary-200'}`}
                        >
                          {b.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <TabButton label="Chat" icon={MessageSquare} active={activeTab === 'chat'} onClick={() => setActiveTab('chat')} />
                  <TabButton label="Onboarding" icon={Sparkles} active={activeTab === 'onboarding'} onClick={() => setActiveTab('onboarding')} />
                  <TabButton label="Settings" icon={SettingsIcon} active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={openWelcome}
                    className="text-[11px] px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-primary-100 border border-white/10"
                    title="Open welcome screen"
                  >
                    Welcome
                  </button>
                  <button
                    onClick={toggleFullscreen}
                    className="text-[11px] px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-primary-100 border border-white/10"
                    title={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
                  >
                    {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                  </button>
                  <button onClick={() => setOpen(false)} className="text-dark-400 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0 agent-grav-pull">
                {activeTab === 'chat' && <AgentChat status={status} onOpenSettings={() => setActiveTab('settings')} />}
                {activeTab === 'onboarding' && (
                  <AgentOnboarding onComplete={handleOnboardingComplete} onOpenSettings={() => setActiveTab('settings')} />
                )}
                {activeTab === 'settings' && <AgentSettings onSaved={refreshStatus} />}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
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
