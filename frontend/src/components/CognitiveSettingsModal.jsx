import React, { useState, useEffect } from 'react';
import { X, Save, Target, Layers, Clock, AlertCircle, CheckCircle } from 'lucide-react';
import cognitiveService from '../services/cognitive';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Cognitive Calibration Settings Modal
 * 
 * A clean, functional settings panel for configuring:
 * 1. Target Retention Rate (FSRS core parameter)
 * 2. Daily New Card Limit (cognitive load management)
 * 3. Focus/Break Duration (Pomodoro customization)
 */
const CognitiveSettingsModal = ({ isOpen, onClose, onUpdate }) => {
    const [settings, setSettings] = useState({
        target_retention: 0.9,
        daily_new_limit: 20,
        focus_duration: 25,
        break_duration: 5
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState(null); // 'success' | 'error' | null

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            fetchSettings();
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    const fetchSettings = async () => {
        setLoading(true);
        try {
            const data = await cognitiveService.getSettings();
            setSettings(data);
        } catch (error) {
            console.error("Failed to load settings", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setSaveStatus(null);
        try {
            await cognitiveService.updateSettings(settings);
            setSaveStatus('success');
            if (onUpdate) onUpdate();
            setTimeout(() => {
                onClose();
            }, 800);
        } catch (error) {
            console.error("Failed to save settings", error);
            setSaveStatus('error');
        } finally {
            setSaving(false);
        }
    };

    const updateSetting = (key, value) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    // Retention rate to human-readable description
    const getRetentionDescription = (rate) => {
        if (rate >= 0.95) return { label: "High Stakes", desc: "For exams, certifications. Maximum retention, more reviews.", color: "text-red-400" };
        if (rate >= 0.88) return { label: "Balanced", desc: "Recommended for most learners. Good retention, efficient reviews.", color: "text-emerald-400" };
        return { label: "Relaxed", desc: "For casual learning. Fewer reviews, some forgetting expected.", color: "text-amber-400" };
    };

    const retentionInfo = getRetentionDescription(settings.target_retention);

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full max-w-md bg-dark-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden"
                >
                    {/* Header */}
                    <div className="p-6 border-b border-white/5">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-bold text-white">Learning Calibration</h2>
                                <p className="text-dark-400 text-sm mt-1">Settings that directly impact your learning.</p>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 hover:bg-white/5 rounded-xl text-dark-400 hover:text-white transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="p-6 space-y-8">
                        {loading ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                            </div>
                        ) : (
                            <>
                                {/* Target Retention Rate */}
                                <div>
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="p-2 bg-primary-500/10 rounded-xl">
                                            <Target className="w-5 h-5 text-primary-400" />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-bold text-white">Target Retention</h3>
                                            <p className="text-xs text-dark-500">How well you want to remember cards</p>
                                        </div>
                                    </div>

                                    <div className="bg-dark-800/50 rounded-2xl p-4 border border-white/5">
                                        <div className="flex items-center justify-between mb-3">
                                            <span className={`text-sm font-bold ${retentionInfo.color}`}>{retentionInfo.label}</span>
                                            <span className="text-2xl font-black text-white">{Math.round(settings.target_retention * 100)}%</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="70"
                                            max="97"
                                            value={Math.round(settings.target_retention * 100)}
                                            onChange={(e) => updateSetting('target_retention', parseInt(e.target.value) / 100)}
                                            className="w-full h-2 bg-dark-700 rounded-full appearance-none cursor-pointer accent-primary-500"
                                        />
                                        <p className="text-xs text-dark-400 mt-3">{retentionInfo.desc}</p>
                                    </div>
                                </div>

                                {/* Daily New Card Limit */}
                                <div>
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="p-2 bg-amber-500/10 rounded-xl">
                                            <Layers className="w-5 h-5 text-amber-400" />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-bold text-white">Daily New Cards</h3>
                                            <p className="text-xs text-dark-500">Maximum new cards introduced per day</p>
                                        </div>
                                    </div>

                                    <div className="bg-dark-800/50 rounded-2xl p-4 border border-white/5">
                                        <div className="flex items-center gap-4">
                                            <input
                                                type="number"
                                                min="1"
                                                max="100"
                                                value={settings.daily_new_limit}
                                                onChange={(e) => updateSetting('daily_new_limit', parseInt(e.target.value) || 1)}
                                                className="w-24 bg-dark-700 border border-white/10 rounded-xl px-4 py-3 text-white text-xl font-bold text-center focus:outline-none focus:border-primary-500"
                                            />
                                            <div className="flex-1">
                                                <p className="text-xs text-dark-400">
                                                    {settings.daily_new_limit <= 10
                                                        ? "Light load. Good for maintaining existing knowledge."
                                                        : settings.daily_new_limit <= 30
                                                            ? "Moderate pace. Balanced learning and review."
                                                            : "Intensive. Ensure you have time for reviews."}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Focus Timer Settings */}
                                <div>
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="p-2 bg-cyan-500/10 rounded-xl">
                                            <Clock className="w-5 h-5 text-cyan-400" />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-bold text-white">Focus Timer</h3>
                                            <p className="text-xs text-dark-500">Pomodoro session configuration</p>
                                        </div>
                                    </div>

                                    <div className="bg-dark-800/50 rounded-2xl p-4 border border-white/5">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="text-xs text-dark-500 block mb-2">Focus (min)</label>
                                                <input
                                                    type="number"
                                                    min="5"
                                                    max="120"
                                                    value={settings.focus_duration}
                                                    onChange={(e) => updateSetting('focus_duration', parseInt(e.target.value) || 25)}
                                                    className="w-full bg-dark-700 border border-white/10 rounded-xl px-4 py-3 text-white text-lg font-bold text-center focus:outline-none focus:border-cyan-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs text-dark-500 block mb-2">Break (min)</label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="30"
                                                    value={settings.break_duration}
                                                    onChange={(e) => updateSetting('break_duration', parseInt(e.target.value) || 5)}
                                                    className="w-full bg-dark-700 border border-white/10 rounded-xl px-4 py-3 text-white text-lg font-bold text-center focus:outline-none focus:border-cyan-500"
                                                />
                                            </div>
                                        </div>
                                        <p className="text-xs text-dark-400 mt-3">Research suggests 25-50min focus windows for optimal concentration.</p>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-6 border-t border-white/5 bg-dark-950/50">
                        {saveStatus === 'error' && (
                            <div className="flex items-center gap-2 text-red-400 text-sm mb-4 p-3 bg-red-500/10 rounded-xl border border-red-500/20">
                                <AlertCircle className="w-4 h-4" />
                                <span>Failed to save. Please try again.</span>
                            </div>
                        )}

                        <button
                            onClick={handleSave}
                            disabled={saving || loading}
                            className={`w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all ${saving || loading
                                    ? 'bg-dark-700 text-dark-400 cursor-not-allowed'
                                    : saveStatus === 'success'
                                        ? 'bg-emerald-500 text-white'
                                        : 'bg-primary-500 hover:bg-primary-400 text-white shadow-lg shadow-primary-500/20'
                                }`}
                        >
                            {saving ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Saving...
                                </>
                            ) : saveStatus === 'success' ? (
                                <>
                                    <CheckCircle className="w-5 h-5" />
                                    Saved!
                                </>
                            ) : (
                                <>
                                    <Save className="w-5 h-5" />
                                    Save Settings
                                </>
                            )}
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default CognitiveSettingsModal;
