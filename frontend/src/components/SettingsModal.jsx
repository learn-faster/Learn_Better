import React, { useState, useEffect } from 'react';
import { X, Save, RefreshCw, Key, Globe, Lock, Cpu, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getUserId } from '@/lib/utils/user-id';

const SettingsModal = ({ isOpen, onClose }) => {
    // Prevent background scrolling when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    const [activeTab, setActiveTab] = useState('global');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [config, setConfig] = useState({
        global: { provider: 'openai', api_key: '', base_url: '', model: '' },
        flashcards: { provider: '', api_key: '', base_url: '', model: '' },
        quiz: { provider: '', api_key: '', base_url: '', model: '' },
        curriculum: { provider: '', api_key: '', base_url: '', model: '' },
    });

    const providers = [
        { value: 'openai', label: 'OpenAI' },
        { value: 'groq', label: 'Groq' },
        { value: 'openrouter', label: 'OpenRouter' },
        { value: 'ollama', label: 'Ollama' },
    ];

    useEffect(() => {
        if (isOpen) {
            fetchConfig();
        }
    }, [isOpen]);

    const fetchConfig = async () => {
        try {
            setLoading(true);
            const userId = getUserId();
            const response = await fetch(`/api/config/llm?user_id=${encodeURIComponent(userId)}`);
            if (response.ok) {
                const data = await response.json();
                setConfig(prev => ({
                    ...prev,
                    ...data
                }));
            }
        } catch (error) {
            console.error("Failed to fetch config:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            const userId = getUserId();
            const response = await fetch(`/api/config/llm?user_id=${encodeURIComponent(userId)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ config }),
            });

            if (response.ok) {
                setSaved(true);
                setTimeout(() => {
                    setSaved(false);
                    onClose();
                }, 1500);
            } else {
                console.error("Failed to save config");
            }
        } catch (error) {
            console.error("Error saving config:", error);
        } finally {
            setSaving(false);
        }
    };

    const handleChange = (section, field, value) => {
        setConfig(prev => ({
            ...prev,
            [section]: {
                ...prev[section],
                [field]: value
            }
        }));
    };

    const renderConfigForm = (section) => {
        const data = config[section] || {};
        const isOverride = section !== 'global';

        return (
            <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
            >
                {isOverride && (
                    <div className="bg-primary-500/10 border border-primary-500/20 p-4 rounded-2xl text-sm text-primary-300 mb-6 flex items-start gap-3">
                        <Globe className="w-5 h-5 shrink-0 mt-0.5" />
                        <p>Override settings for <strong>{section}</strong>. Leave fields empty to inherit from the Global configuration.</p>
                    </div>
                )}

                <div className="space-y-4">
                    <div className="group">
                        <label className="block text-[11px] font-black uppercase tracking-widest text-dark-400 mb-2 ml-1">
                            Provider
                        </label>
                        <div className="relative">
                            <select
                                value={data.provider}
                                onChange={(e) => handleChange(section, 'provider', e.target.value)}
                                className="w-full h-12 rounded-2xl bg-dark-800/80 border border-white/5 px-4 text-white hover:border-white/10 focus:border-primary-500 focus:outline-none transition-all appearance-none cursor-pointer"
                            >
                                {isOverride && <option value="">Use Global Default</option>}
                                {providers.map(p => (
                                    <option key={p.value} value={p.value}>{p.label}</option>
                                ))}
                            </select>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-dark-500">
                                <Cpu className="w-4 h-4" />
                            </div>
                        </div>
                    </div>

                    <div className="group">
                        <label className="block text-[11px] font-black uppercase tracking-widest text-dark-400 mb-2 ml-1">
                            API Key
                        </label>
                        <div className="relative">
                            <input
                                type="password"
                                value={data.api_key || ''}
                                onChange={(e) => handleChange(section, 'api_key', e.target.value)}
                                placeholder={isOverride ? "Inherited from Global" : "Enter API key..."}
                                className="w-full h-12 rounded-2xl bg-dark-800/80 border border-white/5 pl-12 pr-4 text-white placeholder:text-dark-600 focus:border-primary-500 focus:outline-none transition-all"
                            />
                            <Key className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-dark-500" />
                        </div>
                    </div>

                    {(data.provider === 'ollama' || (isOverride && !data.provider && config.global.provider === 'ollama')) && (
                        <div className="group">
                            <label className="block text-[11px] font-black uppercase tracking-widest text-dark-400 mb-2 ml-1">
                                Base URL
                            </label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={data.base_url || ''}
                                    onChange={(e) => handleChange(section, 'base_url', e.target.value)}
                                    placeholder="http://localhost:11434"
                                    className="w-full h-12 rounded-2xl bg-dark-800/80 border border-white/5 pl-12 pr-4 text-white placeholder:text-dark-600 focus:border-primary-500 focus:outline-none transition-all"
                                />
                                <Globe className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-dark-500" />
                            </div>
                        </div>
                    )}

                    <div className="group">
                        <label className="block text-[11px] font-black uppercase tracking-widest text-dark-400 mb-2 ml-1">
                            Model Name
                        </label>
                        <div className="relative">
                            <input
                                type="text"
                                value={data.model || ''}
                                onChange={(e) => handleChange(section, 'model', e.target.value)}
                                placeholder={isOverride ? "Inherited from Global" : "e.g. gpt-4-turbo"}
                                className="w-full h-12 rounded-2xl bg-dark-800/80 border border-white/5 pl-12 pr-4 text-white placeholder:text-dark-600 focus:border-primary-500 focus:outline-none transition-all"
                            />
                            <Cpu className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-dark-500" />
                        </div>
                    </div>
                </div>
            </motion.div>
        );
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/80 backdrop-blur-md"
                    />

                    {/* Modal Container */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="relative w-full max-w-2xl bg-dark-900 border border-white/10 rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-8 border-b border-white/5 bg-white/[0.02]">
                            <div>
                                <h2 className="text-2xl font-black tracking-tighter text-white flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-primary-500 flex items-center justify-center shadow-lg shadow-primary-500/20">
                                        <Lock className="w-5 h-5 text-white" />
                                    </div>
                                    LLM CONFIG
                                </h2>
                                <p className="text-xs font-bold text-dark-500 uppercase tracking-widest mt-1">Configure AI Provider Settings</p>
                            </div>
                            <button
                                onClick={onClose}
                                className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-dark-400 hover:text-white transition-all"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Tabs */}
                        <div className="flex gap-2 p-6 border-b border-white/5 bg-white/[0.01] overflow-x-auto no-scrollbar">
                            {['global', 'flashcards', 'quiz', 'curriculum'].map((tab) => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === tab
                                            ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/20'
                                            : 'bg-white/5 text-dark-400 hover:bg-white/10 hover:text-white'
                                        }`}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar min-h-0 bg-dark-900">
                            {loading ? (
                                <div className="flex flex-col items-center justify-center py-20 gap-4">
                                    <RefreshCw className="w-8 h-8 animate-spin text-primary-500" />
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-dark-500">Loading Configuration...</p>
                                </div>
                            ) : (
                                <AnimatePresence mode="wait">
                                    {renderConfigForm(activeTab)}
                                </AnimatePresence>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-8 border-t border-white/5 flex items-center justify-between bg-white/[0.02]">
                            <p className="text-[10px] font-bold text-dark-500 uppercase tracking-tight max-w-[240px]">
                                These settings are stored securely in your database and override environment variables.
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={onClose}
                                    className="px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest text-dark-400 hover:text-white hover:bg-white/5 transition-all"
                                >
                                    Dismiss
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={saving || saved}
                                    className={`px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg transition-all flex items-center gap-3 min-w-[160px] justify-center ${saved
                                            ? 'bg-primary-500 text-white shadow-primary-500/20'
                                            : 'bg-primary-500 text-white hover:scale-105 active:scale-95 shadow-primary-500/20 disabled:opacity-50'
                                        }`}
                                >
                                    {saving ? (
                                        <RefreshCw className="w-4 h-4 animate-spin" />
                                    ) : saved ? (
                                        <CheckCircle2 className="w-4 h-4" />
                                    ) : (
                                        <Save className="w-4 h-4" />
                                    )}
                                    {saved ? 'Settings Saved' : saving ? 'Saving...' : 'Apply Changes'}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default SettingsModal;
