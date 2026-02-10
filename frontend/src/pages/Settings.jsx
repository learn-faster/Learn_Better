import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Shield, Watch, Bell, Brain, Save, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getHealth } from '../lib/config';
import { formatApiErrorMessage } from '../lib/utils/api-error';
import InlineErrorBanner from '../components/common/InlineErrorBanner';
import { getUserId } from '../lib/utils/user-id';

const Settings = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [connected, setConnected] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [backendHealth, setBackendHealth] = useState(null);
  const [lastTraceId, setLastTraceId] = useState(() => (localStorage.getItem('opik_last_trace_id') || ''));

  // Settings state
  const [settings, setSettings] = useState({
    use_biometrics: false,
    llm_config: {
      provider: 'openai',
      model: 'gpt-4o',
      base_url: '',
      api_key: ''
    },
    embedding_config: {
      provider: 'ollama',
      model: 'embeddinggemma:latest',
      dimensions: 768,
      base_url: '',
      api_key: ''
    },
    opik_config: {
      enabled: false,
      api_key: '',
      workspace: '',
      url_override: '',
      project_name: '',
      use_local: false
    },
    resend_api_key: ''
  });

  useEffect(() => {
    fetchInitialData();

    // Check if we just returned from a successful connection
    const params = new URLSearchParams(location.search);
    if (params.get('fitbit_connected') === 'true') {
      setConnected(true);
      navigate('/settings', { replace: true });
    }
  }, [location]);


  useEffect(() => {
    const refreshTrace = () => {
      setLastTraceId(localStorage.getItem('opik_last_trace_id') || '');
    };
    refreshTrace();
    window.addEventListener('focus', refreshTrace);
    window.addEventListener('storage', refreshTrace);
    return () => {
      window.removeEventListener('focus', refreshTrace);
      window.removeEventListener('storage', refreshTrace);
    };
  }, []);

  const checkBackend = async () => {
    try {
      await getHealth();
      setBackendHealth({ ok: true, detail: 'Connected' });
    } catch (err) {
      setBackendHealth({ ok: false, detail: err?.message || 'Backend not reachable' });
    }
  };

  const fetchInitialData = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      // 1. Fetch Fitbit Status
      const userId = getUserId();
      const statusRes = await fetch(`/api/fitbit/status?user_id=${encodeURIComponent(userId)}`);
      const statusData = await statusRes.json();
      setConnected(statusData.connected);

      // 2. Fetch Agent Settings (which now includes use_biometrics)
      const settingsRes = await fetch(`/api/goals/agent/settings?user_id=${encodeURIComponent(userId)}`);
      const settingsData = await settingsRes.json();
      setSettings(prev => ({
        ...prev,
        use_biometrics: settingsData.use_biometrics || false,
        llm_config: settingsData.llm_config || prev.llm_config,
        embedding_config: settingsData.embedding_config || prev.embedding_config,
        opik_config: settingsData.opik_config || prev.opik_config,
        resend_api_key: settingsData.resend_api_key || ''
      }));
      await checkBackend();
    } catch (error) {
      setErrorMessage(formatApiErrorMessage(error) || 'Failed to load settings.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus(null);
    setErrorMessage('');
    try {
      const userId = getUserId();
      const response = await fetch(`/api/goals/agent/settings?user_id=${encodeURIComponent(userId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });

      if (response.ok) {
        setSaveStatus('success');
        setTimeout(() => setSaveStatus(null), 3000);
      } else {
        setSaveStatus('error');
        setErrorMessage('Failed to save settings. Check required fields and try again.');
      }
    } catch (error) {
      setSaveStatus('error');
      setErrorMessage(formatApiErrorMessage(error) || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleConnectFitbit = () => {
    const userId = getUserId();
    window.location.href = `/api/fitbit/auth?user_id=${encodeURIComponent(userId)}`;
  };

  const handleDisconnectFitbit = async () => {
    try {
      const userId = getUserId();
      const response = await fetch(`/api/fitbit/disconnect?user_id=${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (response.ok) setConnected(false);
    } catch (error) {
      console.error('Error disconnecting:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-dark-950">
        <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-950 text-gray-100 p-8 pt-24 font-['Inter']">
      <div className="max-w-4xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-400">
              System Configuration
            </h1>
            <p className="text-gray-400 mt-2">Adjust your biological and cognitive preferences.</p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium transition-all duration-200 ${saving ? 'bg-dark-700 cursor-not-allowed' : 'bg-primary-600 hover:bg-primary-500 shadow-lg shadow-primary-500/20'
              }`}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        {/* Save Status Notification */}
        <AnimatePresence>
          {saveStatus && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={`flex items-center gap-3 p-4 rounded-xl border ${saveStatus === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                }`}
            >
              {saveStatus === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
              {saveStatus === 'success' ? 'Settings saved successfully' : 'Failed to save settings'}
            </motion.div>
          )}
        </AnimatePresence>
        <InlineErrorBanner message={errorMessage} className="text-sm" />
        <InlineErrorBanner
          message={backendHealth && backendHealth.ok === false ? 'Backend not reachable. Check your API URL or server status.' : ''}
          className="text-sm border-amber-500/30 bg-amber-500/10 text-amber-200"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Fitbit Section */}
          <div className="bg-dark-900/50 backdrop-blur-xl border border-white/5 rounded-2xl p-6 hover:border-white/10 transition-colors">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 rounded-xl bg-primary-500/10">
                <Watch className="w-5 h-5 text-primary-400" />
              </div>
              <h2 className="text-xl font-semibold">Biometric Sync</h2>
            </div>

            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${connected ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]' : 'bg-rose-500'}`} />
                  <span className="font-medium">{connected ? 'Fitbit Connected' : 'Disconnected'}</span>
                </div>
                {connected ? (
                  <button onClick={handleDisconnectFitbit} className="text-rose-400 hover:text-rose-300 text-sm font-medium transition-colors">
                    Disconnect
                  </button>
                ) : (
                  <button onClick={handleConnectFitbit} className="text-primary-400 hover:text-primary-300 text-sm font-medium transition-colors">
                    Connect Fitbit
                  </button>
                )}
              </div>

              {connected && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                  <label className="flex items-center justify-between cursor-pointer group">
                    <div className="flex items-center gap-3">
                      <Brain className="w-5 h-5 text-indigo-400" />
                      <div>
                        <p className="font-medium">Predictive Focus Planning</p>
                        <p className="text-xs text-gray-500">Sync study windows with sleep cycles</p>
                      </div>
                    </div>
                    <div className="relative inline-flex items-center">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={settings.use_biometrics}
                        onChange={(e) => setSettings({ ...settings, use_biometrics: e.target.checked })}
                      />
                      <div className="w-11 h-6 bg-dark-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
                    </div>
                  </label>
                </motion.div>
              )}
            </div>
          </div>

          {/* Observability (Opik) */}
          <div className="bg-dark-900/50 backdrop-blur-xl border border-white/5 rounded-2xl p-6 hover:border-white/10 transition-colors">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 rounded-xl bg-purple-500/10">
                <Shield className="w-5 h-5 text-purple-400" />
              </div>
              <h2 className="text-xl font-semibold">Observability (Opik)</h2>
            </div>
            <div className="space-y-4">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-gray-300">Enable tracing</span>
                <div className="relative inline-flex items-center">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={settings.opik_config?.enabled || false}
                    onChange={(e) => setSettings({
                      ...settings,
                      opik_config: { ...settings.opik_config, enabled: e.target.checked }
                    })}
                  />
                  <div className="w-11 h-6 bg-dark-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500"></div>
                </div>
              </label>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">API Key</label>
                <input
                  type="password"
                  value={settings.opik_config?.api_key || ''}
                  onChange={(e) => setSettings({
                    ...settings,
                    opik_config: { ...settings.opik_config, api_key: e.target.value }
                  })}
                  className="w-full bg-white/5 border border-white/5 rounded-xl px-4 py-2.5 focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all outline-none"
                  placeholder="opik_..."
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Workspace</label>
                <input
                  type="text"
                  value={settings.opik_config?.workspace || ''}
                  onChange={(e) => setSettings({
                    ...settings,
                    opik_config: { ...settings.opik_config, workspace: e.target.value }
                  })}
                  className="w-full bg-white/5 border border-white/5 rounded-xl px-4 py-2.5 focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all outline-none"
                  placeholder="your-workspace"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">URL Override (optional)</label>
                <input
                  type="text"
                  value={settings.opik_config?.url_override || ''}
                  onChange={(e) => setSettings({
                    ...settings,
                    opik_config: { ...settings.opik_config, url_override: e.target.value }
                  })}
                  className="w-full bg-white/5 border border-white/5 rounded-xl px-4 py-2.5 focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all outline-none"
                  placeholder="https://www.comet.com/"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Project Name</label>
                <input
                  type="text"
                  value={settings.opik_config?.project_name || ''}
                  onChange={(e) => setSettings({
                    ...settings,
                    opik_config: { ...settings.opik_config, project_name: e.target.value }
                  })}
                  className="w-full bg-white/5 border border-white/5 rounded-xl px-4 py-2.5 focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all outline-none"
                  placeholder="learnfast-core"
                />
              </div>
              <div className="text-xs text-gray-500">
                Latest trace: <span className="text-gray-300">{lastTraceId || '—'}</span>
              </div>
            </div>
          </div>

          {/* Email Notifications */}
          <div className="bg-dark-900/50 backdrop-blur-xl border border-white/5 rounded-2xl p-6 hover:border-white/10 transition-colors">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 rounded-xl bg-purple-500/10">
                <Bell className="w-5 h-5 text-purple-400" />
              </div>
              <h2 className="text-xl font-semibold">Notifications</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Resend API Key</label>
                <input
                  type="password"
                  placeholder="re_..."
                  value={settings.resend_api_key}
                  onChange={(e) => setSettings({ ...settings, resend_api_key: e.target.value })}
                  className="w-full bg-white/5 border border-white/5 rounded-xl px-4 py-2.5 focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/50 transition-all outline-none"
                />
              </div>
            </div>
          </div>

          {/* Advanced Security */}
          <div className="md:col-span-2 bg-dark-900/50 backdrop-blur-xl border border-white/5 rounded-2xl p-6 hover:border-white/10 transition-colors">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 rounded-xl bg-emerald-500/10">
                <Shield className="w-5 h-5 text-emerald-400" />
              </div>
              <h2 className="text-xl font-semibold">Model Preferences</h2>
            </div>
            <div className="space-y-6">
              {/* LLM Config */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-indigo-400 uppercase tracking-wider">LLM Generation</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Provider</label>
                    <select
                      value={settings.llm_config.provider}
                      onChange={(e) => setSettings({ ...settings, llm_config: { ...settings.llm_config, provider: e.target.value } })}
                      className="w-full bg-dark-800 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-indigo-500/50 outline-none"
                    >
                      <option value="openai">OpenAI</option>
                      <option value="groq">Groq</option>
                      <option value="ollama">Ollama</option>
                      <option value="openrouter">OpenRouter</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Model</label>
                    <input
                      type="text"
                      value={settings.llm_config.model}
                      onChange={(e) => setSettings({ ...settings, llm_config: { ...settings.llm_config, model: e.target.value } })}
                      className="w-full bg-dark-800 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-indigo-500/50 outline-none"
                      placeholder="gpt-4o, llama3..."
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1">API Key</label>
                    <input
                      type="password"
                      value={settings.llm_config.api_key || ''}
                      onChange={(e) => setSettings({ ...settings, llm_config: { ...settings.llm_config, api_key: e.target.value } })}
                      className="w-full bg-dark-800 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-indigo-500/50 outline-none"
                      placeholder="sk-..."
                    />
                  </div>
                  {settings.llm_config.provider === 'ollama' && (
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Base URL</label>
                      <input
                        type="text"
                        value={settings.llm_config.base_url || ''}
                        onChange={(e) => setSettings({ ...settings, llm_config: { ...settings.llm_config, base_url: e.target.value } })}
                        className="w-full bg-dark-800 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-indigo-500/50 outline-none"
                        placeholder="http://localhost:11434"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Embedding Config */}
              <div className="space-y-4 pt-4 border-t border-white/5">
                <h3 className="text-sm font-medium text-emerald-400 uppercase tracking-wider">Embeddings</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Provider</label>
                    <select
                      value={settings.embedding_config?.provider || 'ollama'}
                      onChange={(e) => setSettings({ ...settings, embedding_config: { ...settings.embedding_config, provider: e.target.value } })}
                      className="w-full bg-dark-800 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-emerald-500/50 outline-none"
                    >
                      <option value="ollama">Ollama</option>
                      <option value="openai">OpenAI</option>
                      <option value="local">Local (HuggingFace)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Dimensions</label>
                    <select
                      value={settings.embedding_config?.dimensions || 768}
                      onChange={(e) => setSettings({ ...settings, embedding_config: { ...settings.embedding_config, dimensions: parseInt(e.target.value) } })}
                      className="w-full bg-dark-800 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-emerald-500/50 outline-none"
                    >
                      <option value={384}>384 (MiniLM)</option>
                      <option value={768}>768 (Base/Gemma)</option>
                      <option value={1024}>1024 (Large)</option>
                      <option value={1536}>1536 (OpenAI)</option>
                      <option value={3072}>3072 (Large/Voyage)</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Model Name</label>
                    <input
                      type="text"
                      value={settings.embedding_config?.model || ''}
                      onChange={(e) => setSettings({ ...settings, embedding_config: { ...settings.embedding_config, model: e.target.value } })}
                      className="w-full bg-dark-800 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-emerald-500/50 outline-none"
                      placeholder="embeddinggemma:latest"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-200/80">
                      Warning: Changing embedding dimensions will require re-indexing all documents.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default Settings;
