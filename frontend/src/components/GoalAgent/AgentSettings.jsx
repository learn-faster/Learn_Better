import React, { useState, useEffect } from 'react';
import { Save, Loader2, Eye, EyeOff, ShieldCheck, Sparkles, RefreshCw } from 'lucide-react';
import { agentApi } from '../../services/agent';

const AgentSettings = ({ onClose, onSaved }) => {
  const [settings, setSettings] = useState({
    llm_config: {
      provider: 'openai',
      model: 'gpt-4o',
      base_url: '',
      temperature: 0.7,
      api_key: ''
    },
    vision_llm_config: {
      provider: 'openai',
      model: 'gpt-4o',
      base_url: '',
      temperature: 0.7,
      api_key: ''
    },
    guardrail_mode: 'soft',
    enable_screenshots: true,
    check_in_frequency_hours: 4,
    use_biometrics: false,
    biometrics_mode: 'intensity',
    auto_refresh_fitbit: true,
    bedtime: '22:00',
    email_negotiation_enabled: true,
    email: '',
    resend_api_key: '',
    resend_reply_domain: ''
  });
  const [connected, setConnected] = useState(false);
  const [fitbitSummary, setFitbitSummary] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showVisionKey, setShowVisionKey] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const [settingsData, statusData] = await Promise.all([
          agentApi.settings(),
          agentApi.status()
        ]);

        if (settingsData) {
          setSettings((prev) => ({
            ...prev,
            ...settingsData
          }));
        }
        setConnected(statusData?.fitbit_connected || false);
        if (statusData?.fitbit_connected) {
          const summary = await agentApi.fitbitSummary();
          setFitbitSummary(summary);
        }
      } catch (err) {
        console.error('Error fetching settings:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleChange = (section, field, value) => {
    if (section) {
      setSettings((prev) => ({
        ...prev,
        [section]: {
          ...prev[section],
          [field]: value
        }
      }));
    } else {
      setSettings((prev) => ({
        ...prev,
        [field]: value
      }));
    }
    setError(null);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await agentApi.saveSettings(settings);
      onSaved?.();
      if (onClose) onClose();
    } catch (error) {
      console.error('Error saving settings:', error);
      setError(typeof error === 'string' ? error : 'Failed to save settings. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRefreshFitbit = async () => {
    setRefreshing(true);
    try {
      const summary = await agentApi.fitbitRefresh();
      setFitbitSummary(summary);
    } catch (err) {
      console.error('Failed to refresh Fitbit summary:', err);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto px-5 py-5 custom-scrollbar">
      <div className="space-y-6">
        {error && (
          <div className="p-3 bg-red-500/10 text-red-300 text-sm rounded-lg border border-red-500/20">
            {error}
          </div>
        )}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-dark-400">
            <Loader2 className="animate-spin" size={32} />
            <span className="text-sm">Loading settings...</span>
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-semibold text-white">Agent Configuration</p>
              <p className="text-[11px] text-dark-400 mt-1">Tune how the agent reasons, connects to tools, and checks in.</p>
            </div>

            <Section title="Guardrails" icon={ShieldCheck}>
              <div className="flex items-center justify-between">
                <span className="text-sm text-dark-300">Mode</span>
                <select
                  value={settings.guardrail_mode}
                  onChange={(e) => handleChange(null, 'guardrail_mode', e.target.value)}
                  className={inputClass}
                >
                  <option value="soft">Soft</option>
                  <option value="hard">Hard (refuse out‑of‑domain)</option>
                </select>
              </div>
            </Section>

            <Section title="LLM Configuration">
              <ConfigFields config={settings.llm_config} onChange={(f, v) => handleChange('llm_config', f, v)} showKey={showApiKey} setShowKey={setShowApiKey} />
            </Section>

            <Section title="Vision LLM">
              <ConfigFields config={settings.vision_llm_config} onChange={(f, v) => handleChange('vision_llm_config', f, v)} showKey={showVisionKey} setShowKey={setShowVisionKey} />
            </Section>

            <Section title="Capabilities & Biometrics">
              <div className="flex items-center justify-between">
                <span className="text-sm text-dark-300">Enable Screenshots</span>
                <input
                  type="checkbox"
                  checked={settings.enable_screenshots}
                  onChange={(e) => handleChange(null, 'enable_screenshots', e.target.checked)}
                  className="w-4 h-4 text-primary-500 rounded focus:ring-primary-500"
                />
              </div>
              <div className="flex items-center justify-between mt-3">
                <span className="text-sm text-dark-300">Use Biometrics</span>
                <input
                  type="checkbox"
                  checked={settings.use_biometrics}
                  onChange={(e) => handleChange(null, 'use_biometrics', e.target.checked)}
                  className="w-4 h-4 text-primary-500 rounded focus:ring-primary-500"
                />
              </div>
              <div className="mt-3">
                <label className="block text-xs text-dark-400 mb-1">Biometrics Mode</label>
                <select
                  value={settings.biometrics_mode || 'intensity'}
                  onChange={(e) => handleChange(null, 'biometrics_mode', e.target.value)}
                  className={inputClass}
                >
                  <option value="insights">Insights only</option>
                  <option value="intensity">Intensity tuning</option>
                  <option value="scheduling">Full scheduling</option>
                </select>
              </div>
              <div className="flex items-center justify-between mt-3">
                <span className="text-sm text-dark-300">Auto-refresh Fitbit</span>
                <input
                  type="checkbox"
                  checked={!!settings.auto_refresh_fitbit}
                  onChange={(e) => handleChange(null, 'auto_refresh_fitbit', e.target.checked)}
                  className="w-4 h-4 text-primary-500 rounded focus:ring-primary-500"
                />
              </div>
              {!connected && (
                <div className="mt-3 text-xs text-dark-500">Fitbit not connected. Use onboarding or Settings to connect.</div>
              )}
              {connected && (
                <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-dark-300 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-primary-200">
                      <Sparkles className="w-3.5 h-3.5" /> Readiness
                    </span>
                    <span className="font-semibold">{fitbitSummary?.readiness_score ?? '—'}</span>
                  </div>
                  <div className="text-[11px] text-dark-400">
                    Sleep: {fitbitSummary?.sleep_duration_hours ?? '—'}h • Efficiency: {fitbitSummary?.sleep_efficiency ?? '—'}%
                  </div>
                  <div className="text-[11px] text-dark-400">
                    Resting HR: {fitbitSummary?.resting_heart_rate ?? '—'} bpm
                  </div>
                  <button
                    onClick={handleRefreshFitbit}
                    disabled={refreshing}
                    className="mt-2 inline-flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-semibold bg-white/5 hover:bg-white/10 text-primary-200"
                  >
                    {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Refresh now
                  </button>
                </div>
              )}
            </Section>

            <Section title="Negotiation Emails">
              <label className="block text-xs text-dark-400 mb-1">Bedtime (local)</label>
              <input
                type="time"
                value={settings.bedtime || '22:00'}
                onChange={(e) => handleChange(null, 'bedtime', e.target.value)}
                className={inputClass}
              />
              <div className="flex items-center justify-between mt-3">
                <span className="text-sm text-dark-300">Email negotiation enabled</span>
                <input
                  type="checkbox"
                  checked={!!settings.email_negotiation_enabled}
                  onChange={(e) => handleChange(null, 'email_negotiation_enabled', e.target.checked)}
                  className="w-4 h-4 text-primary-500 rounded focus:ring-primary-500"
                />
              </div>
              <p className="text-[11px] text-dark-500 mt-2">Agent sends a bedtime check‑in if daily plan is incomplete.</p>
            </Section>

            <Section title="Email">
              <label className="block text-xs text-dark-400 mb-1">Email</label>
              <input
                type="email"
                value={settings.email || ''}
                onChange={(e) => handleChange(null, 'email', e.target.value)}
                className={inputClass}
                placeholder="you@email.com"
              />
              <label className="block text-xs text-dark-400 mt-3 mb-1">Resend API key</label>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={settings.resend_api_key || ''}
                  onChange={(e) => handleChange(null, 'resend_api_key', e.target.value)}
                  className={inputClass}
                  placeholder="re_..."
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-white"
                >
                  {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <label className="block text-xs text-dark-400 mt-3 mb-1">Resend Reply Domain</label>
              <input
                type="text"
                value={settings.resend_reply_domain || ''}
                onChange={(e) => handleChange(null, 'resend_reply_domain', e.target.value)}
                className={inputClass}
                placeholder="reply.yourdomain.com"
              />
            </Section>

            <button
              onClick={handleSave}
              disabled={isSaving}
              className="w-full py-3 bg-gradient-to-r from-primary-500 to-indigo-500 text-white rounded-2xl hover:from-primary-400 hover:to-indigo-400 disabled:opacity-70 flex items-center justify-center gap-2 font-medium"
            >
              {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              Save Configuration
            </button>
          </>
        )}
      </div>
    </div>
  );
};

const Section = ({ title, icon: Icon, children }) => (
  <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
    <div className="flex items-center gap-2 text-sm font-semibold text-white">
      {Icon ? <Icon className="w-4 h-4 text-primary-300" /> : null}
      {title}
    </div>
    {children}
  </div>
);

const ConfigFields = ({ config, onChange, showKey, setShowKey }) => (
  <div className="space-y-3">
    <div>
      <label className="block text-xs text-dark-400 mb-1">Provider</label>
      <select
        value={config.provider}
        onChange={(e) => onChange('provider', e.target.value)}
        className={inputClass}
      >
        <option value="openai">OpenAI</option>
        <option value="groq">Groq</option>
        <option value="ollama">Ollama</option>
        <option value="openrouter">OpenRouter</option>
      </select>
    </div>
    <div>
      <label className="block text-xs text-dark-400 mb-1">Model Name</label>
      <input
        type="text"
        value={config.model}
        onChange={(e) => onChange('model', e.target.value)}
        className={inputClass}
      />
    </div>
    <div>
      <label className="block text-xs text-dark-400 mb-1">API Key</label>
      <div className="relative">
        <input
          type={showKey ? 'text' : 'password'}
          value={config.api_key || ''}
          onChange={(e) => onChange('api_key', e.target.value)}
          className={inputClass}
        />
        <button
          type="button"
          onClick={() => setShowKey(!showKey)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-white"
        >
          {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
    {config.provider === 'ollama' && (
      <div>
        <label className="block text-xs text-dark-400 mb-1">Base URL</label>
        <input
          type="text"
          value={config.base_url || ''}
          onChange={(e) => onChange('base_url', e.target.value)}
          className={inputClass}
          placeholder="http://localhost:11434"
        />
      </div>
    )}
  </div>
);

const inputClass = "w-full px-3 py-2 rounded-xl bg-dark-900/70 border border-white/10 text-sm text-white placeholder:text-dark-500 focus:border-primary-500/60 focus:ring-2 focus:ring-primary-500/20";

export default AgentSettings;
