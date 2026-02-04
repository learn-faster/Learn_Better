import React, { useState } from 'react';
import { Key, Bot, Zap, Server, Check, ChevronRight, Sparkles, ExternalLink } from 'lucide-react';

/**
 * Inline API Key Setup Component.
 * 
 * A beautiful onboarding prompt for configuring LLM access.
 * Shows when API key is missing, allows quick setup inline.
 * 
 * @param {Object} props - Component properties.
 * @param {Function} props.onConfigured - Callback when config is saved.
 * @param {boolean} [props.compact] - Use compact mode for sidebar.
 * @returns {JSX.Element} The rendered setup component.
 */
const ApiKeySetup = ({ onConfigured, compact = false }) => {
    const [provider, setProvider] = useState('groq');
    const [apiKey, setApiKey] = useState('');
    const [model, setModel] = useState('qwen/qwen3-32b');
    const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
    const [step, setStep] = useState(1);
    const [saving, setSaving] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);

    // Initialize from localStorage
    React.useEffect(() => {
        const savedProvider = localStorage.getItem('llm_provider');
        const savedKey = localStorage.getItem('llm_api_key');
        const savedModel = localStorage.getItem('llm_model');
        const savedUrl = localStorage.getItem('ollama_base_url');

        if (savedProvider) setProvider(savedProvider);
        if (savedKey) setApiKey(savedKey);
        if (savedModel) setModel(savedModel);
        if (savedUrl) setOllamaUrl(savedUrl);

        setIsInitialized(true);
    }, []);

    const providers = [
        {
            id: 'groq',
            name: 'Groq',
            icon: <Zap className="w-5 h-5" />,
            description: 'Ultra-fast inference',
            defaultModel: 'qwen/qwen3-32b',
            keyUrl: 'https://console.groq.com/keys',
            color: 'from-orange-500 to-amber-500'
        },
        {
            id: 'openai',
            name: 'OpenAI',
            icon: <Bot className="w-5 h-5" />,
            description: 'GPT-4 & GPT-3.5',
            defaultModel: 'gpt-4o-mini',
            keyUrl: 'https://platform.openai.com/api-keys',
            color: 'from-emerald-500 to-teal-500'
        },
        {
            id: 'ollama',
            name: 'Ollama',
            icon: <Server className="w-5 h-5" />,
            description: 'Run locally, free',
            defaultModel: 'llama3',
            keyUrl: null,
            color: 'from-purple-500 to-indigo-500'
        },
        {
            id: 'google',
            name: 'Google Gemini',
            icon: <Sparkles className="w-5 h-5" />,
            description: 'Flash & Pro models',
            defaultModel: 'gemini-2.0-flash-exp',
            keyUrl: 'https://aistudio.google.com/app/apikey',
            color: 'from-blue-500 to-indigo-600'
        }
    ];

    const selectedProvider = providers.find(p => p.id === provider);

    const handleSave = () => {
        setSaving(true);

        // Save to localStorage
        localStorage.setItem('llm_provider', provider);
        localStorage.setItem('llm_api_key', apiKey);
        localStorage.setItem('llm_model', model);
        localStorage.setItem('ollama_base_url', ollamaUrl);

        setTimeout(() => {
            setSaving(false);
            if (onConfigured) onConfigured();
        }, 500);
    };

    const canProceed = provider === 'ollama' || (apiKey && apiKey.trim().length > 0);

    if (compact) {
        return (
            <div className="p-4 rounded-2xl bg-gradient-to-br from-primary-500/10 to-primary-600/5 border border-primary-500/20">
                <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 rounded-xl bg-primary-500/20">
                        <Key className="w-4 h-4 text-primary-400" />
                    </div>
                    <div>
                        <h4 className="font-bold text-sm text-white">Setup Required</h4>
                        <p className="text-[10px] text-primary-200/70">Configure AI to generate flashcards</p>
                    </div>
                </div>

                <div className="space-y-3">
                    <select
                        value={provider}
                        onChange={(e) => {
                            setProvider(e.target.value);
                            const p = providers.find(pr => pr.id === e.target.value);
                            setModel(p?.defaultModel || '');
                        }}
                        className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-2 text-sm"
                    >
                        {providers.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>

                    {provider !== 'ollama' && (
                        <input
                            type="password"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder="Paste your API key"
                            className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-2 text-sm"
                        />
                    )}

                    <button
                        onClick={handleSave}
                        disabled={!canProceed || saving}
                        className="w-full btn-primary py-2 text-xs font-bold"
                    >
                        {saving ? 'Saving...' : 'Save & Enable AI'}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="rounded-3xl bg-gradient-to-br from-dark-800 to-dark-900 border border-white/10 p-8 relative overflow-hidden">
            {/* Decorative background */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary-500/5 blur-[100px] rounded-full -z-10" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-primary-600/5 blur-[80px] rounded-full -z-10" />

            {/* Header */}
            <div className="flex items-start gap-4 mb-8">
                <div className="p-4 rounded-2xl bg-gradient-to-br from-primary-500/20 to-primary-600/10 border border-primary-500/20">
                    <Sparkles className="w-8 h-8 text-primary-400" />
                </div>
                <div className="flex-1">
                    <h3 className="text-2xl font-black text-white mb-1">Enable AI Generation</h3>
                    <p className="text-dark-400 text-sm">Configure your LLM provider to automatically generate flashcards and quizzes from your documents.</p>
                </div>
            </div>

            {step === 1 ? (
                <>
                    {/* Provider Selection */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                        {providers.map((p) => (
                            <button
                                key={p.id}
                                onClick={() => {
                                    setProvider(p.id);
                                    setModel(p.defaultModel);
                                }}
                                className={`p-5 rounded-2xl border-2 transition-all text-left group ${provider === p.id
                                    ? 'border-primary-500 bg-primary-500/10 shadow-lg shadow-primary-500/10'
                                    : 'border-white/5 hover:border-white/20 hover:bg-white/5'
                                    }`}
                            >
                                <div className={`p-3 rounded-xl bg-gradient-to-br ${p.color} w-fit mb-4 ${provider === p.id ? 'shadow-lg' : 'opacity-60 group-hover:opacity-100'}`}>
                                    {p.icon}
                                </div>
                                <h4 className="font-bold text-white text-lg mb-1">{p.name}</h4>
                                <p className="text-xs text-dark-400">{p.description}</p>
                                {provider === p.id && (
                                    <div className="mt-3 flex items-center gap-1 text-primary-400 text-xs font-bold">
                                        <Check className="w-4 h-4" />
                                        Selected
                                    </div>
                                )}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={() => setStep(2)}
                        className="btn-primary w-full py-4 text-sm font-bold"
                    >
                        Continue with {selectedProvider?.name}
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </>
            ) : (
                <>
                    {/* Configuration */}
                    <div className="space-y-6 mb-8">
                        <div className="flex items-center gap-3 p-4 rounded-2xl bg-white/5 border border-white/10">
                            <div className={`p-2 rounded-xl bg-gradient-to-br ${selectedProvider?.color}`}>
                                {selectedProvider?.icon}
                            </div>
                            <div>
                                <span className="font-bold text-white">{selectedProvider?.name}</span>
                                <button
                                    onClick={() => setStep(1)}
                                    className="text-xs text-primary-400 ml-3 hover:underline"
                                >
                                    Change
                                </button>
                            </div>
                        </div>

                        {provider !== 'ollama' ? (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-sm font-bold text-dark-300">API Key</label>
                                    {selectedProvider?.keyUrl && (
                                        <a
                                            href={selectedProvider.keyUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1"
                                        >
                                            Get a key <ExternalLink className="w-3 h-3" />
                                        </a>
                                    )}
                                </div>
                                <div className="relative">
                                    <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" />
                                    <input
                                        type="password"
                                        value={apiKey}
                                        onChange={(e) => setApiKey(e.target.value)}
                                        placeholder={`Paste your ${selectedProvider?.name} API key`}
                                        className="w-full bg-dark-800 border border-white/10 rounded-xl pl-12 pr-4 py-4 text-white placeholder:text-dark-600 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                                    />
                                </div>
                                <p className="text-xs text-dark-500">Your API key is stored locally and never sent to our servers.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-dark-300">Ollama Base URL</label>
                                <input
                                    type="text"
                                    value={ollamaUrl}
                                    onChange={(e) => setOllamaUrl(e.target.value)}
                                    placeholder="http://localhost:11434"
                                    className="w-full bg-dark-800 border border-white/10 rounded-xl px-4 py-4 text-white placeholder:text-dark-600 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                                />
                                <p className="text-xs text-dark-500">Make sure Ollama is running locally.</p>
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-sm font-bold text-dark-300">Model</label>
                            <input
                                type="text"
                                value={model}
                                onChange={(e) => setModel(e.target.value)}
                                placeholder={selectedProvider?.defaultModel}
                                className="w-full bg-dark-800 border border-white/10 rounded-xl px-4 py-4 text-white placeholder:text-dark-600 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                            />
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <button
                            onClick={() => setStep(1)}
                            className="btn-secondary flex-1 py-4"
                        >
                            Back
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={!canProceed || saving}
                            className="btn-primary flex-1 py-4 text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {saving ? (
                                <span className="flex items-center gap-2">
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Saving...
                                </span>
                            ) : (
                                <>
                                    <Check className="w-5 h-5" />
                                    Save & Enable AI
                                </>
                            )}
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

export default ApiKeySetup;
