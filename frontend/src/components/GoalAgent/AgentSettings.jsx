import React, { useState, useEffect } from 'react';
import { Save, Loader2, X, Eye, EyeOff } from 'lucide-react';
import api from '../../services/api';

const AgentSettings = ({ onClose }) => {
    const [settings, setSettings] = useState({
        llm_config: {
            provider: 'openai',
            model: 'gpt-4o',
            base_url: '',
            temperature: 0.7,
            api_key: ''
        },
        enable_screenshots: true,
        check_in_frequency_hours: 4
    });
    const [error, setError] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [showApiKey, setShowApiKey] = useState(false);

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const data = await api.get('/goals/agent/settings');
                if (data) {
                    setSettings(data);
                }
            } catch (err) {
                console.error('Error fetching settings:', err);
                // Keep defaults if fetch fails, but log it
            } finally {
                setIsLoading(false);
            }
        };
        fetchSettings();
    }, []);

    const handleChange = (section, field, value) => {
        if (section) {
            setSettings(prev => ({
                ...prev,
                [section]: {
                    ...prev[section],
                    [field]: value
                }
            }));
        } else {
            setSettings(prev => ({
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
            await api.post('/goals/agent/settings', settings);

            if (onClose) onClose();
        } catch (error) {
            console.error('Error saving settings:', error);
            setError(typeof error === 'string' ? error : 'Failed to save settings. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 border border-gray-200">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Agent Settings</h3>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                    <X size={20} />
                </button>
            </div>

            <div className="space-y-6">
                {error && (
                    <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
                        {error}
                    </div>
                )}
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-500">
                        <Loader2 className="animate-spin" size={32} />
                        <span className="text-sm">Loading settings...</span>
                    </div>
                ) : (
                    <>
                        {/* LLM Configuration */}
                        <div>
                            <h4 className="text-sm font-medium text-gray-700 mb-3">LLM Configuration</h4>
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Provider</label>
                                    <select
                                        value={settings.llm_config.provider}
                                        onChange={(e) => handleChange('llm_config', 'provider', e.target.value)}
                                        className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-100 outline-none text-sm"
                                    >
                                        <option value="openai">OpenAI</option>
                                        <option value="groq">Groq</option>
                                        <option value="ollama">Ollama</option>
                                        <option value="openrouter">OpenRouter</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Model Name</label>
                                    <input
                                        type="text"
                                        value={settings.llm_config.model}
                                        onChange={(e) => handleChange('llm_config', 'model', e.target.value)}
                                        className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-100 outline-none text-sm"
                                        placeholder="e.g. gpt-4o"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">API Key</label>
                                    <div className="relative">
                                        <input
                                            type={showApiKey ? "text" : "password"}
                                            value={settings.llm_config.api_key || ''}
                                            onChange={(e) => handleChange('llm_config', 'api_key', e.target.value)}
                                            className="w-full px-3 py-2 pr-10 rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-100 outline-none text-sm font-mono"
                                            placeholder="sk-..."
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowApiKey(!showApiKey)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                                        >
                                            {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                </div>

                                {settings.llm_config.provider === 'ollama' && (
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">Base URL</label>
                                        <input
                                            type="text"
                                            value={settings.llm_config.base_url}
                                            onChange={(e) => handleChange('llm_config', 'base_url', e.target.value)}
                                            className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-indigo-100 outline-none text-sm"
                                            placeholder="http://localhost:11434"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Behavior */}
                        <div>
                            <h4 className="text-sm font-medium text-gray-700 mb-3">Capabilities</h4>
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-600">Enable Screenshots</span>
                                <input
                                    type="checkbox"
                                    checked={settings.enable_screenshots}
                                    onChange={(e) => handleChange(null, 'enable_screenshots', e.target.checked)}
                                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                />
                            </div>
                        </div>

                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="w-full py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-70 flex items-center justify-center gap-2 font-medium transition-colors"
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

export default AgentSettings;
