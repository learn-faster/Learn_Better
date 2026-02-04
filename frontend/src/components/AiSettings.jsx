import React, { useState, useEffect } from 'react';
import { Settings, Save, X, Bot, Key } from 'lucide-react';
import Card from './ui/Card';

/**
 * AI Configuration Modal.
 * 
 * Allows users to set their LLM provider (OpenAI, Groq, Ollama) and API keys.
 * Settings are persisted in local storage for use across sessions.
 * 
 * @param {Object} props - Component properties.
 * @param {boolean} props.isOpen - Visbility state.
 * @param {Function} props.onClose - Callback to close the modal.
 * @returns {JSX.Element|null} The rendered settings overlay.
 */
const AISettings = ({ isOpen, onClose }) => {
    const [provider, setProvider] = useState('groq');  // Changed default to 'groq'
    const [apiKey, setApiKey] = useState('');
    const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
    const [model, setModel] = useState('qwen/qwen3-32b');  // Changed default to your model

    useEffect(() => {
        // Load saved settings
        const savedProvider = localStorage.getItem('llm_provider') || 'groq';
        const savedKey = localStorage.getItem('llm_api_key') || '';
        const savedUrl = localStorage.getItem('ollama_base_url') || 'http://localhost:11434';
        const savedModel = localStorage.getItem('llm_model') || 'qwen/qwen3-32b';  // Changed default

        setProvider(savedProvider);
        setApiKey(savedKey);
        setOllamaUrl(savedUrl);
        setModel(savedModel);
    }, [isOpen]);

    const handleSave = () => {
        localStorage.setItem('llm_provider', provider);
        localStorage.setItem('llm_api_key', apiKey);
        localStorage.setItem('ollama_base_url', ollamaUrl);
        localStorage.setItem('llm_model', model);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-md">
                <Card className="relative">
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 text-dark-400 hover:text-white"
                    >
                        <X className="w-5 h-5" />
                    </button>

                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-lg bg-primary-500/10 flex items-center justify-center border border-primary-500/20">
                            <Bot className="w-6 h-6 text-primary-400" />
                        </div>
                        <h2 className="text-xl font-bold">AI Settings</h2>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-dark-300 mb-1">Provider</label>
                            <select
                                value={provider}
                                onChange={(e) => {
                                    const p = e.target.value;
                                    setProvider(p);
                                    // Set default model based on provider
                                    if (p === 'openai') setModel('gpt-3.5-turbo');
                                    else if (p === 'groq') setModel('qwen/qwen3-32b');  // Changed to your model
                                    else if (p === 'ollama') setModel('llama3');
                                }}
                                className="w-full bg-dark-800 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-primary-500"
                            >
                                <option value="openai">OpenAI</option>
                                <option value="groq">Groq</option>
                                <option value="ollama">Ollama (Local)</option>
                            </select>
                        </div>

                        {provider !== 'ollama' && (
                            <div>
                                <label className="block text-sm font-medium text-dark-300 mb-1">API Key</label>
                                <div className="relative">
                                    <Key className="absolute left-3 top-2.5 w-4 h-4 text-dark-500" />
                                    <input
                                        type="password"
                                        value={apiKey}
                                        onChange={(e) => setApiKey(e.target.value)}
                                        placeholder={`Enter ${provider} API Key`}
                                        className="w-full bg-dark-800 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-white focus:outline-none focus:border-primary-500"
                                    />
                                </div>
                            </div>
                        )}

                        {provider === 'ollama' && (
                            <div>
                                <label className="block text-sm font-medium text-dark-300 mb-1">Base URL</label>
                                <input
                                    type="text"
                                    value={ollamaUrl}
                                    onChange={(e) => setOllamaUrl(e.target.value)}
                                    placeholder="http://localhost:11434"
                                    className="w-full bg-dark-800 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-primary-500"
                                />
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-dark-300 mb-1">Model Name</label>
                            <input
                                type="text"
                                value={model}
                                onChange={(e) => setModel(e.target.value)}
                                placeholder={provider === 'openai' ? 'gpt-3.5-turbo' : provider === 'groq' ? 'qwen/qwen3-32b' : 'llama3'}  // Updated placeholder
                                className="w-full bg-dark-800 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-primary-500"
                            />
                        </div>

                        <button
                            onClick={handleSave}
                            className="w-full mt-2 btn-primary flex items-center justify-center gap-2"
                        >
                            <Save className="w-4 h-4" />
                            Save Configuration
                        </button>
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default AISettings;