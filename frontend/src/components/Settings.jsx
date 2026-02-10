import React, { useEffect, useMemo, useState } from 'react';
import { Settings as SettingsIcon, Save, X, Bot, Key, Bell, Mail, BrainCircuit, Zap, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../services/api';
import cognitiveService from '../services/cognitive';
import { getHealth } from '../lib/config';
import { LLM_PROVIDERS } from '../lib/llmProviders';

/**
 * Global Settings Drawer
 * 
 * Manages application-wide configuration including:
 * 1. AI Provider Settings (LLM, API Keys)
 * 2. Notification Preferences (Email, Streaks, Digests)
 * 3. Biometrics (Fitbit)
 */
const Settings = ({ isOpen, onClose }) => {
    const [activeTab, setActiveTab] = useState('ai');

    // AI State
    const [provider, setProvider] = useState('groq');
    const [apiKey, setApiKey] = useState('');
    const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
    const [model, setModel] = useState('qwen/qwen3-32b');
    const [embeddingProvider, setEmbeddingProvider] = useState('ollama');
    const [embeddingModel, setEmbeddingModel] = useState('embeddinggemma:latest');
    const [embeddingApiKey, setEmbeddingApiKey] = useState('');
    const [embeddingBaseUrl, setEmbeddingBaseUrl] = useState('http://localhost:11434');
    const [applyGlobalSettings, setApplyGlobalSettings] = useState(true);

    // Notification State
    const [email, setEmail] = useState('');
    const [resendApiKey, setResendApiKey] = useState('');
    const [notifyDaily, setNotifyDaily] = useState(true);
    const [notifyStreak, setNotifyStreak] = useState(true);
    const [notifyDigest, setNotifyDigest] = useState(true);
    const [timezone, setTimezone] = useState('UTC');
    const [weeklyDigestDay, setWeeklyDigestDay] = useState(6);
    const [weeklyDigestTime, setWeeklyDigestTime] = useState('18:00');

    // Biometrics
    const [connected, setConnected] = useState(false);
    const [useBiometrics, setUseBiometrics] = useState(false);
    const [fitbitClientId, setFitbitClientId] = useState('');
    const [fitbitClientSecret, setFitbitClientSecret] = useState('');
    const [fitbitRedirectUri, setFitbitRedirectUri] = useState('http://localhost:5173/api/fitbit/callback');

    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [saveError, setSaveError] = useState('');
    const [backendHealth, setBackendHealth] = useState(null);
    const [backendHealthLoading, setBackendHealthLoading] = useState(false);
    const [llmHealth, setLlmHealth] = useState(null);
    const [llmHealthLoading, setLlmHealthLoading] = useState(false);

    const EMBEDDING_PROVIDERS = [
        { value: 'openai', label: 'OpenAI' },
        { value: 'ollama', label: 'Ollama (Local)' },
        { value: 'openrouter', label: 'OpenRouter' },
        { value: 'together', label: 'Together' },
        { value: 'fireworks', label: 'Fireworks' },
        { value: 'mistral', label: 'Mistral' },
        { value: 'deepseek', label: 'DeepSeek' },
        { value: 'perplexity', label: 'Perplexity' },
        { value: 'huggingface', label: 'Hugging Face' },
        { value: 'custom', label: 'OpenAI-Compatible' }
    ];

    const tabs = useMemo(() => ([
        { key: 'ai', label: 'AI Config', icon: Bot },
        { key: 'notifications', label: 'Notifications', icon: Bell },
        { key: 'biometrics', label: 'Biometrics', icon: BrainCircuit }
    ]), []);

    const checkBackendHealth = async () => {
        setBackendHealthLoading(true);
        try {
            await getHealth();
            setBackendHealth({ ok: true, detail: 'Connected' });
        } catch (err) {
            setBackendHealth({
                ok: false,
                detail: err?.message || 'Backend not reachable'
            });
        } finally {
            setBackendHealthLoading(false);
        }
    };

    const checkLlmHealth = async () => {
        setLlmHealthLoading(true);
        try {
            const result = await cognitiveService.checkLlmHealth();
            setLlmHealth(result);
        } catch (err) {
            setLlmHealth({
                ok: false,
                detail: err?.userMessage || err?.message || 'Failed to check LLM connection.'
            });
        } finally {
            setLlmHealthLoading(false);
        }
    };

    useEffect(() => {
        if (!isOpen) return;
        setIsLoading(true);
        setLoadError('');

        const savedProvider = localStorage.getItem('llm_provider') || 'openai';
        const savedKey = localStorage.getItem('llm_api_key') || '';
        const savedUrl = localStorage.getItem('ollama_base_url') || 'http://localhost:11434';
        const savedModel = localStorage.getItem('llm_model') || 'qwen/qwen3-32b';
        const savedApplyAll = localStorage.getItem('global_settings_apply_all');

        setProvider(savedProvider);
        setApiKey(savedKey);
        setOllamaUrl(savedUrl);
        setModel(savedModel);
        setApplyGlobalSettings(savedApplyAll !== 'false');

        const fetchSettings = async () => {
            try {
                const [settingsData, statusData, cognitiveData] = await Promise.all([
                    api.get('/goals/agent/settings'),
                    api.get('/fitbit/status'),
                    cognitiveService.getSettings()
                ]);

                const llmConfig = cognitiveData?.llm_config || {};
                const globalConfig = llmConfig.global || llmConfig;
                if (globalConfig?.provider) {
                    setProvider(globalConfig.provider);
                    localStorage.setItem('llm_provider', globalConfig.provider);
                }
                if (globalConfig?.model) {
                    setModel(globalConfig.model);
                    localStorage.setItem('llm_model', globalConfig.model);
                }
                if (globalConfig?.api_key !== undefined) {
                    setApiKey(globalConfig.api_key || '');
                    localStorage.setItem('llm_api_key', globalConfig.api_key || '');
                }
                if (globalConfig?.base_url) {
                    setOllamaUrl(globalConfig.base_url);
                    localStorage.setItem('ollama_base_url', globalConfig.base_url);
                }

                if (settingsData.email) setEmail(settingsData.email);
                if (settingsData.resend_api_key) setResendApiKey(settingsData.resend_api_key);
                setNotifyDaily(settingsData.email_daily_reminder !== false);
                setNotifyStreak(settingsData.email_streak_alert !== false);
                setNotifyDigest(settingsData.email_weekly_digest !== false);
                const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
                setTimezone(settingsData.timezone || detectedTz);
                const day = settingsData.weekly_digest_day ?? 6;
                const hour = settingsData.weekly_digest_hour ?? 18;
                const minute = settingsData.weekly_digest_minute ?? 0;
                setWeeklyDigestDay(day);
                setWeeklyDigestTime(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
                setUseBiometrics(settingsData.use_biometrics === true);
                if (settingsData.fitbit_client_id) setFitbitClientId(settingsData.fitbit_client_id);
                if (settingsData.fitbit_client_secret) setFitbitClientSecret(settingsData.fitbit_client_secret);
                if (settingsData.fitbit_redirect_uri) setFitbitRedirectUri(settingsData.fitbit_redirect_uri);
                setConnected(statusData.connected || false);
                if (cognitiveData?.embedding_provider) setEmbeddingProvider(cognitiveData.embedding_provider);
                if (cognitiveData?.embedding_model) setEmbeddingModel(cognitiveData.embedding_model);
                if (cognitiveData?.embedding_api_key !== undefined) setEmbeddingApiKey(cognitiveData.embedding_api_key || '');
                if (cognitiveData?.embedding_base_url) setEmbeddingBaseUrl(cognitiveData.embedding_base_url);
                await checkBackendHealth();
                await checkLlmHealth();
            } catch (err) {
                setLoadError(err?.userMessage || err?.message || 'Failed to load settings.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchSettings();
    }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollBarWidth > 0) {
      document.body.style.paddingRight = `${scrollBarWidth}px`;
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    };
  }, [isOpen]);

    const handleSave = async () => {
        setIsSaving(true);
        setSaveError('');

        const llmConfig = {
            provider,
            api_key: apiKey,
            model
        };

        if (provider === 'ollama' || provider === 'ollama_cloud') {
            llmConfig.base_url = ollamaUrl;
        }

        localStorage.setItem('llm_provider', provider);
        localStorage.setItem('llm_api_key', apiKey);
        localStorage.setItem('ollama_base_url', ollamaUrl);
        localStorage.setItem('llm_model', model);
        localStorage.setItem('global_settings_apply_all', String(applyGlobalSettings));

        const [hourStr, minuteStr] = weeklyDigestTime.split(':');
        const digestHour = Math.max(0, Math.min(23, parseInt(hourStr || '18', 10)));
        const digestMinute = Math.max(0, Math.min(59, parseInt(minuteStr || '0', 10)));

        try {
            await api.post('/goals/agent/settings', {
                email,
                resend_api_key: resendApiKey,
                email_daily_reminder: notifyDaily,
                email_streak_alert: notifyStreak,
                email_weekly_digest: notifyDigest,
                timezone,
                weekly_digest_day: weeklyDigestDay,
                weekly_digest_hour: digestHour,
                weekly_digest_minute: digestMinute,
                use_biometrics: useBiometrics,
                fitbit_client_id: fitbitClientId,
                fitbit_client_secret: fitbitClientSecret,
                fitbit_redirect_uri: fitbitRedirectUri,
                ...(applyGlobalSettings ? { llm_config: llmConfig } : {})
            });
            await cognitiveService.updateSettings({
                llm_config: {
                    provider: llmConfig.provider,
                    model: llmConfig.model,
                    api_key: llmConfig.api_key,
                    base_url: llmConfig.base_url
                },
                embedding_provider: embeddingProvider,
                embedding_model: embeddingModel,
                embedding_api_key: embeddingApiKey,
                embedding_base_url: embeddingBaseUrl
            });
            await checkLlmHealth();
            onClose?.();
        } catch (err) {
            setSaveError(err?.userMessage || err?.message || 'Failed to save settings.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ opacity: 0, x: 40 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 40 }}
                        transition={{ type: 'spring', stiffness: 220, damping: 24 }}
                        className="absolute right-0 top-0 h-full w-full max-w-5xl bg-dark-950/95 border-l border-white/10 shadow-2xl flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-6 md:px-8 py-5 border-b border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-primary-500/10 flex items-center justify-center border border-primary-500/20">
                                    <SettingsIcon className="w-5 h-5 text-primary-300" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-white">Global Settings</h2>
                                    <p className="text-xs text-dark-400">Configure models, notifications, and biometrics.</p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 rounded-lg hover:bg-white/5 text-dark-400 hover:text-white transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[220px_1fr]">
                            <aside className="border-r border-white/5 px-4 md:px-6 py-4 space-y-2 bg-dark-950/60">
                                {tabs.map(({ key, label, icon: Icon }) => (
                                    <button
                                        key={key}
                                        onClick={() => setActiveTab(key)}
                                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${activeTab === key
                                            ? 'bg-primary-500/15 text-primary-200 border border-primary-500/30'
                                            : 'text-dark-400 hover:text-white hover:bg-white/5 border border-transparent'
                                            }`}
                                    >
                                        <Icon className="w-4 h-4" />
                                        {label}
                                    </button>
                                ))}
                            </aside>

                            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-6 md:px-8 py-6">
                                {isLoading ? (
                                    <div className="flex flex-col items-center justify-center py-20 text-dark-400 gap-3">
                                        <Loader2 className="w-7 h-7 animate-spin" />
                                        <span className="text-sm">Loading settings...</span>
                                    </div>
                                ) : (
                                    <>
                                        {loadError && (
                                            <div className="mb-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
                                                {loadError}
                                            </div>
                                        )}
                                        {saveError && (
                                            <div className="mb-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
                                                {saveError}
                                            </div>
                                        )}
                                        {backendHealth && backendHealth.ok === false && (
                                            <div className="mb-4 rounded-2xl border border-primary-500/30 bg-primary-500/10 px-4 py-3 text-xs text-primary-200">
                                                Backend not reachable. Check your API URL or server status.
                                            </div>
                                        )}
                                        {activeTab === 'ai' && (
                                            <div className="space-y-5">
                                                <SectionCard title="Connection Status" description="Check if the backend and LLM are reachable.">
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                        <div className={`rounded-xl border px-3 py-3 text-xs ${backendHealth?.ok ? 'border-primary-500/30 bg-primary-500/10 text-primary-200' : 'border-rose-500/30 bg-rose-500/10 text-rose-200'}`}>
                                                            <div className="flex items-center justify-between">
                                                                <span>Backend</span>
                                                                <button
                                                                    onClick={checkBackendHealth}
                                                                    disabled={backendHealthLoading}
                                                                    className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] text-white disabled:opacity-60"
                                                                >
                                                                    {backendHealthLoading ? 'Checking...' : 'Check'}
                                                                </button>
                                                            </div>
                                                            <div className="mt-2 text-[10px] opacity-80">{backendHealthLoading ? 'Checking...' : (backendHealth?.detail || 'Unknown')}</div>
                                                        </div>
                                                        <div className={`rounded-xl border px-3 py-3 text-xs ${llmHealth?.ok ? 'border-primary-500/30 bg-primary-500/10 text-primary-200' : 'border-rose-500/30 bg-rose-500/10 text-rose-200'}`}>
                                                            <div className="flex items-center justify-between">
                                                                <span>LLM</span>
                                                                <button
                                                                    onClick={checkLlmHealth}
                                                                    disabled={llmHealthLoading}
                                                                    className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] text-white disabled:opacity-60"
                                                                >
                                                                    {llmHealthLoading ? 'Checking...' : 'Check'}
                                                                </button>
                                                            </div>
                                                            <div className="mt-2 text-[10px] opacity-80">{llmHealthLoading ? 'Checking...' : (llmHealth?.detail || 'Unknown')}</div>
                                                            {!llmHealth?.ok && (
                                                                <div className="mt-2 text-[10px] opacity-70">Save settings first if you recently changed provider or model.</div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </SectionCard>
                                                <SectionCard title="Scope" description="Apply these settings across all modules.">
                                                    <ToggleRow
                                                        title="Use global settings everywhere"
                                                        description="When enabled, agent and document processing use this configuration."
                                                        enabled={applyGlobalSettings}
                                                        onToggle={() => setApplyGlobalSettings(!applyGlobalSettings)}
                                                    />
                                                    {!applyGlobalSettings && (
                                                        <p className="text-[10px] text-dark-400 mt-2">Module-specific settings will be used instead.</p>
                                                    )}
                                                </SectionCard>

                                                <SectionCard title="Provider" description="Choose which LLM powers your experience.">
                                                    <select
                                                        value={provider}
                                                        onChange={(e) => {
                                                            const p = e.target.value;
                                                            setProvider(p);
                                                            if (p === 'openai') setModel('gpt-4o');
                                                            else if (p === 'groq') setModel('qwen/qwen3-32b');
                                                            else if (p === 'openrouter') setModel('openai/gpt-4o');
                                                            else if (p === 'together') setModel('meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo');
                                                            else if (p === 'fireworks') setModel('accounts/fireworks/models/llama-v3p1-70b-instruct');
                                                            else if (p === 'mistral') setModel('mistral-large-latest');
                                                            else if (p === 'deepseek') setModel('deepseek-chat');
                                                            else if (p === 'perplexity') setModel('llama-3.1-sonar-small-128k-online');
                                                            else if (p === 'huggingface') setModel('meta-llama/Meta-Llama-3-70B-Instruct');
                                                            else if (p === 'ollama' || p === 'ollama_cloud') setModel('llama3');
                                                        }}
                                                        className={inputClass}
                                                    >
                                                        {LLM_PROVIDERS.map((prov) => (
                                                            <option key={prov.value} value={prov.value}>{prov.label}</option>
                                                        ))}
                                                    </select>
                                                </SectionCard>

                                                {provider !== 'ollama' && (
                                                    <SectionCard title="API Key" description="Used to authenticate requests.">
                                                        <div className="relative">
                                                            <Key className="absolute left-4 top-3.5 w-4 h-4 text-dark-500" />
                                                            <input
                                                                type="password"
                                                                value={apiKey}
                                                                onChange={(e) => setApiKey(e.target.value)}
                                                                placeholder={`Enter ${provider === 'ollama_cloud' ? 'Ollama' : provider} API Key`}
                                                                className={`${inputClass} pl-10`}
                                                            />
                                                        </div>
                                                    </SectionCard>
                                                )}

                                                {(provider === 'ollama' || provider === 'ollama_cloud' || provider === 'custom' || ['openrouter','together','fireworks','mistral','deepseek','perplexity','huggingface'].includes(provider)) && (
                                                    <SectionCard title="Base URL" description="OpenAI-compatible base URL or local endpoint.">
                                                        <input
                                                            type="text"
                                                            value={ollamaUrl}
                                                            onChange={(e) => setOllamaUrl(e.target.value)}
                                                            placeholder={provider === 'ollama' ? "http://localhost:11434" : "https://api.openai.com/v1"}
                                                            className={inputClass}
                                                        />
                                                    </SectionCard>
                                                )}

                                                <SectionCard title="Model Name" description="Exact model identifier.">
                                                    <input
                                                        type="text"
                                                        value={model}
                                                        onChange={(e) => setModel(e.target.value)}
                                                        placeholder="e.g. gpt-4o, llama3"
                                                        className={inputClass}
                                                    />
                                                </SectionCard>

                                                <SectionCard title="Embeddings" description="Configure the provider and model used for document ingestion.">
                                                    <div className="space-y-3">
                                                        <select
                                                            value={embeddingProvider}
                                                            onChange={(e) => setEmbeddingProvider(e.target.value)}
                                                            className={inputClass}
                                                        >
                                                            {EMBEDDING_PROVIDERS.map((prov) => (
                                                                <option key={prov.value} value={prov.value}>{prov.label}</option>
                                                            ))}
                                                        </select>
                                                        <input
                                                            type="text"
                                                            value={embeddingModel}
                                                            onChange={(e) => setEmbeddingModel(e.target.value)}
                                                            placeholder="e.g. text-embedding-3-large"
                                                            className={inputClass}
                                                        />
                                                        {embeddingProvider !== 'ollama' && (
                                                            <input
                                                                type="password"
                                                                value={embeddingApiKey}
                                                                onChange={(e) => setEmbeddingApiKey(e.target.value)}
                                                                placeholder="Embedding API key"
                                                                className={inputClass}
                                                            />
                                                        )}
                                                        {(embeddingProvider === 'ollama' || ['openrouter','together','fireworks','mistral','deepseek','perplexity','huggingface','custom'].includes(embeddingProvider)) && (
                                                            <input
                                                                type="text"
                                                                value={embeddingBaseUrl}
                                                                onChange={(e) => setEmbeddingBaseUrl(e.target.value)}
                                                                placeholder="Base URL"
                                                                className={inputClass}
                                                            />
                                                        )}
                                                        <p className="text-[10px] text-dark-400">Use an OpenAI-compatible endpoint for providers not listed.</p>
                                                    </div>
                                                </SectionCard>
                                            </div>
                                        )}

                                        {activeTab === 'notifications' && (
                                            <div className="space-y-6">
                                                <SectionCard title="Contact" description="Where the agent should reach you.">
                                                    <div className="space-y-3">
                                                        <div className="relative">
                                                            <Mail className="absolute left-4 top-3.5 w-4 h-4 text-dark-500" />
                                                            <input
                                                                type="email"
                                                                value={email}
                                                                onChange={(e) => setEmail(e.target.value)}
                                                                placeholder="you@example.com"
                                                                className={`${inputClass} pl-10`}
                                                            />
                                                        </div>
                                                        <div className="relative">
                                                            <Key className="absolute left-4 top-3.5 w-4 h-4 text-dark-500" />
                                                            <input
                                                                type="password"
                                                                value={resendApiKey}
                                                                onChange={(e) => setResendApiKey(e.target.value)}
                                                                placeholder="Resend API key"
                                                                className={`${inputClass} pl-10`}
                                                            />
                                                        </div>
                                                        <p className="text-[10px] text-dark-400">Use Resend for reliable delivery.</p>
                                                    </div>
                                                </SectionCard>

                                                <SectionCard title="Preferences" description="Choose when we ping you.">
                                                    <div className="space-y-3">
                                                        <ToggleRow
                                                            title="Daily Quiz Reminder"
                                                            description="Get a reminder when cards are due."
                                                            enabled={notifyDaily}
                                                            onToggle={() => setNotifyDaily(!notifyDaily)}
                                                        />
                                                        <ToggleRow
                                                            title="Streak Alerts"
                                                            description="Warn me before I lose my streak."
                                                            enabled={notifyStreak}
                                                            onToggle={() => setNotifyStreak(!notifyStreak)}
                                                        />
                                                        <ToggleRow
                                                            title="Weekly Digest"
                                                            description="Send a weekly performance recap."
                                                            enabled={notifyDigest}
                                                            onToggle={() => setNotifyDigest(!notifyDigest)}
                                                        />
                                                    </div>
                                                </SectionCard>

                                                <SectionCard title="Weekly Digest" description="Schedule when it arrives.">
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="block text-xs font-semibold text-dark-300 mb-2 uppercase tracking-wider">Day</label>
                                                            <select
                                                                value={weeklyDigestDay}
                                                                onChange={(e) => setWeeklyDigestDay(parseInt(e.target.value, 10))}
                                                                className={inputClass}
                                                            >
                                                                <option value={0}>Monday</option>
                                                                <option value={1}>Tuesday</option>
                                                                <option value={2}>Wednesday</option>
                                                                <option value={3}>Thursday</option>
                                                                <option value={4}>Friday</option>
                                                                <option value={5}>Saturday</option>
                                                                <option value={6}>Sunday</option>
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-semibold text-dark-300 mb-2 uppercase tracking-wider">Time</label>
                                                            <input
                                                                type="time"
                                                                value={weeklyDigestTime}
                                                                onChange={(e) => setWeeklyDigestTime(e.target.value)}
                                                                className={inputClass}
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="mt-4">
                                                        <label className="block text-xs font-semibold text-dark-300 mb-2 uppercase tracking-wider">Timezone</label>
                                                        <input
                                                            type="text"
                                                            value={timezone}
                                                            onChange={(e) => setTimezone(e.target.value)}
                                                            placeholder="America/New_York"
                                                            className={inputClass}
                                                        />
                                                    </div>
                                                </SectionCard>
                                            </div>
                                        )}

                                        {activeTab === 'biometrics' && (
                                            <div className="space-y-6">
                                                <SectionCard title="Fitbit Sync" description="Use biometrics to optimize study timing.">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${connected ? 'bg-primary-500/20 border border-primary-500/30' : 'bg-dark-800 border border-white/5'}`}>
                                                                <Zap className={`w-5 h-5 ${connected ? 'text-primary-300' : 'text-dark-500'}`} />
                                                            </div>
                                                            <div>
                                                                <p className="font-semibold text-white">Connection</p>
                                                                <p className={`text-xs ${connected ? 'text-primary-300' : 'text-dark-500'}`}>
                                                                    {connected ? 'Device Synced' : 'Not connected'}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        {!connected ? (
                                                            <button
                                                                onClick={() => window.location.href = '/api/fitbit/auth?user_id=default_user'}
                                                                disabled={!fitbitClientId || !fitbitRedirectUri}
                                                                className="px-4 py-2 bg-primary-500/80 hover:bg-primary-500 text-dark-950 text-sm font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                                            >
                                                                Connect
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={async () => {
                                                                    await api.delete('/fitbit/disconnect');
                                                                    setConnected(false);
                                                                }}
                                                                className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm font-semibold rounded-lg transition-all border border-red-500/20"
                                                            >
                                                                Disconnect
                                                            </button>
                                                        )}
                                                    </div>
                                                </SectionCard>

                                                {!connected && (
                                                    <SectionCard title="Fitbit Credentials" description="Store these securely before connecting.">
                                                        <div className="space-y-3">
                                                            <input
                                                                type="text"
                                                                value={fitbitClientId}
                                                                onChange={(e) => setFitbitClientId(e.target.value)}
                                                                placeholder="Client ID"
                                                                className={inputClass}
                                                            />
                                                            <input
                                                                type="password"
                                                                value={fitbitClientSecret}
                                                                onChange={(e) => setFitbitClientSecret(e.target.value)}
                                                                placeholder="Client Secret"
                                                                className={inputClass}
                                                            />
                                                            <input
                                                                type="text"
                                                                value={fitbitRedirectUri}
                                                                onChange={(e) => setFitbitRedirectUri(e.target.value)}
                                                                placeholder="http://localhost:5173/api/fitbit/callback"
                                                                className={`${inputClass} font-mono`}
                                                            />
                                                            <p className="text-[10px] text-dark-400">Must match your Fitbit app redirect URI.</p>
                                                        </div>
                                                    </SectionCard>
                                                )}

                                                {connected && (
                                                    <SectionCard title="Biometric Features" description="Enable personalized scheduling.">
                                                        <ToggleRow
                                                            title="Predictive Focusing"
                                                            description="Optimize sessions using sleep and recovery."
                                                            enabled={useBiometrics}
                                                            onToggle={() => setUseBiometrics(!useBiometrics)}
                                                        />
                                                    </SectionCard>
                                                )}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="px-6 md:px-8 py-4 border-t border-white/5 flex items-center justify-end gap-3 bg-dark-950/80">
                            <button
                                onClick={onClose}
                                className="px-4 py-2 rounded-lg text-sm font-semibold text-dark-300 hover:text-white hover:bg-white/5 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="px-5 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 text-white text-sm font-semibold shadow-lg shadow-primary-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Save Settings
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

const SectionCard = ({ title, description, children }) => (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
        <div>
            <p className="text-sm font-semibold text-white">{title}</p>
            {description && <p className="text-xs text-dark-400 mt-1">{description}</p>}
        </div>
        {children}
    </div>
);

const ToggleRow = ({ title, description, enabled, onToggle }) => (
    <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
    >
        <div className="text-left">
            <span className="block font-medium text-white">{title}</span>
            <span className="text-xs text-dark-400">{description}</span>
        </div>
        <div className={`w-12 h-6 rounded-full p-1 transition-colors ${enabled ? 'bg-primary-500' : 'bg-dark-700'}`}>
            <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${enabled ? 'translate-x-6' : 'translate-x-0'}`} />
        </div>
    </button>
);

const inputClass = "w-full bg-dark-900/70 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary-500 transition-colors";

export default Settings;
