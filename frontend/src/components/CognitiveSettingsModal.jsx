import React, { useState, useEffect } from 'react';
import { X, Clock, Sun, Moon, Save } from 'lucide-react';
import cognitiveService from '../services/cognitive';
import Card from './ui/Card';

const CognitiveSettingsModal = ({ isOpen, onClose, onUpdate }) => {
    const [wakeTime, setWakeTime] = useState('08:00');
    const [chronotype, setChronotype] = useState('neutral');
    const [useFsrs, setUseFsrs] = useState(0);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const chronotypes = [
        {
            id: 'morning',
            label: 'Lark',
            icon: Sun,
            desc: 'Peak alertness: Early Morning.',
            details: 'You wake up naturally before 7 AM. Tackle complex theory immediately.',
            advice: 'Best if you struggle to focus after dinner.'
        },
        {
            id: 'neutral',
            label: 'Neutral',
            icon: Clock,
            desc: 'Peak alertness: Mid-Morning to Afternoon.',
            details: 'Steady energy levels. Most adaptable to standard schedules.',
            advice: 'Best if your energy is consistent throughout the day.'
        },
        {
            id: 'evening',
            label: 'Owl',
            icon: Moon,
            desc: 'Peak alertness: Late Evening.',
            details: 'Slow start, but hyper-focused after 8 PM. Save hard topics for night.',
            advice: 'Best if you hate early mornings and love late-night coding.'
        },
    ];

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            const fetchSettings = async () => {
                setLoading(true);
                try {
                    const settings = await cognitiveService.getSettings();
                    setWakeTime(settings.wake_time || '08:00');
                    setChronotype(settings.chronotype || 'neutral');
                    setUseFsrs(settings.use_fsrs || 0);
                } catch (error) {
                    console.error("Failed to load settings", error);
                } finally {
                    setLoading(false);
                }
            };
            fetchSettings();
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        try {
            await cognitiveService.updateSettings({
                wake_time: wakeTime,
                chronotype: chronotype,
                use_fsrs: useFsrs
            });
            if (onUpdate) onUpdate();
            // Show success briefly before closing
            setTimeout(() => {
                setSaving(false);
                onClose();
            }, 600);
        } catch (error) {
            console.error("Failed to save settings", error);
            setError("Failed to save settings. Please ensure the backend is running.");
            setSaving(false);
        }
    };

    // Calculate phase times for preview
    const getPhaseTimes = (timeStr) => {
        const [h, m] = timeStr.split(':').map(Number);
        const start = new Date(); start.setHours(h, m, 0);

        const p1End = new Date(start); p1End.setHours(h + 7);
        const p2End = new Date(start); p2End.setHours(h + 13);

        const fmt = d => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return { start: fmt(start), p1: fmt(p1End), p2: fmt(p2End) };
    };

    const phases = getPhaseTimes(wakeTime);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-md animate-in fade-in duration-300">
            <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
                <div className="relative transform overflow-hidden w-full max-w-lg text-left transition-all animate-in zoom-in-95 duration-300 my-8">
                    <Card className="relative overflow-hidden border-indigo-500/40 shadow-2xl shadow-indigo-500/20 bg-dark-900/90 backdrop-blur-xl">
                        {/* Decorative Background Glows */}
                        <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />
                        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 text-dark-400 hover:text-white transition-all hover:scale-110 p-2 rounded-full hover:bg-white/5 z-30"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div className="flex items-center gap-4 mb-8">
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 border border-white/10">
                                <Clock className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-white tracking-tight">Cognitive Calibration</h2>
                                <p className="text-indigo-200/70 text-sm">Align your learning model to your natural biology.</p>
                            </div>
                        </div>

                        <div className="space-y-8">
                            {/* Interactive Timeline Preview */}
                            <div className="bg-dark-800/40 rounded-2xl p-5 border border-white/5 relative group">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-indigo-300/60">Estimated Daily Rhythm</h3>
                                    <span className="text-[10px] text-dark-500 italic">Phase-based adaptation</span>
                                </div>
                                <div className="flex items-center gap-3 mb-3 text-sm">
                                    <span className="text-indigo-200 font-mono font-bold">{phases.start}</span>
                                    <div className="flex-1 h-3 bg-dark-700/50 rounded-full overflow-hidden flex border border-white/5">
                                        <div className="h-full bg-gradient-to-r from-indigo-600 to-indigo-400 w-[55%] shadow-[2px_0_10px_rgba(99,102,241,0.3)]" title="Deep Work Phase" />
                                        <div className="h-full bg-gradient-to-r from-purple-600 to-purple-400 w-[45%]" title="Creative/Practice Phase" />
                                    </div>
                                    <span className="text-indigo-200 font-mono font-bold">{phases.p2}</span>
                                </div>
                                <div className="flex justify-between text-[10px] text-dark-400 font-semibold px-1">
                                    <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]"></div> Theory/New Concepts</span>
                                    <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.6)]"></div> Practice/Review</span>
                                </div>
                            </div>

                            {/* Wake Time Input */}
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-widest text-indigo-300/60 mb-2">Typical Wake-up Time</label>
                                <div className="relative group">
                                    <input
                                        type="time"
                                        value={wakeTime}
                                        onChange={(e) => setWakeTime(e.target.value)}
                                        className="w-full bg-dark-900/50 border border-white/10 rounded-2xl px-5 py-4 text-white text-xl font-mono focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all cursor-pointer"
                                    />
                                    <div className="absolute right-5 top-4.5 text-[10px] font-bold text-indigo-500/60 uppercase tracking-tighter opacity-0 group-hover:opacity-100 transition-opacity">
                                        Adjusts Timeline
                                    </div>
                                </div>
                            </div>

                            {/* Rich Chronotype Selection */}
                            <div className="max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                                <label className="block text-xs font-bold uppercase tracking-widest text-indigo-300/60 mb-3">Chronotype Profile</label>
                                <div className="grid grid-cols-1 gap-4">
                                    {chronotypes.map((type) => (
                                        <button
                                            key={type.id}
                                            onClick={() => setChronotype(type.id)}
                                            className={`p-5 rounded-3xl border text-left transition-all relative overflow-hidden group ${chronotype === type.id
                                                ? 'bg-indigo-600/10 border-indigo-500/60 ring-1 ring-indigo-500/20 shadow-lg shadow-indigo-500/5'
                                                : 'bg-dark-800/30 border-white/5 hover:bg-dark-700/50 hover:border-white/10'
                                                }`}
                                        >
                                            <div className="flex items-start gap-5">
                                                <div className={`p-4 rounded-2xl transition-all ${chronotype === type.id ? 'bg-indigo-500/20 text-indigo-300 scale-110 shadow-lg shadow-indigo-500/10' : 'bg-white/5 text-dark-400 group-hover:text-white animate-pulse-slow'}`}>
                                                    <type.icon className="w-7 h-7" />
                                                </div>
                                                <div className="flex-1">
                                                    <div className="flex items-center justify-between mb-1.5">
                                                        <span className="text-lg font-bold text-white tracking-tight">{type.label}</span>
                                                        {chronotype === type.id && (
                                                            <span className="flex items-center gap-1.5 text-[10px] font-bold bg-indigo-500 text-white px-3 py-1 rounded-full uppercase tracking-widest shadow-lg shadow-indigo-500/30">
                                                                <div className="w-1 h-1 bg-white rounded-full animate-ping" /> Active
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-indigo-100/90 mb-2.5 font-semibold">{type.desc}</p>
                                                    <p className="text-xs text-dark-300 leading-relaxed mb-4 font-medium">{type.details}</p>

                                                    <div className="flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 p-2.5 rounded-xl">
                                                        <span className="text-base">💡</span>
                                                        <span className="text-xs text-indigo-50 font-medium tracking-tight">
                                                            {type.advice}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Experimental Features Section */}
                            <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-5 relative overflow-hidden">
                                <div className="absolute top-0 right-0 bg-amber-500 text-[8px] font-bold text-black px-3 py-1 rounded-bl-lg uppercase tracking-widest">
                                    Experimental
                                </div>
                                <div className="flex items-center justify-between">
                                    <div className="flex-1 pr-4">
                                        <h4 className="text-sm font-bold text-white mb-1">FSRS Algorithm</h4>
                                        <p className="text-xs text-dark-400 leading-relaxed">
                                            A modern spaced repetition algorithm with improved retention prediction. More efficient than SM-2.
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setUseFsrs(useFsrs === 1 ? 0 : 1)}
                                        className={`relative w-14 h-8 rounded-full transition-all duration-300 flex items-center ${useFsrs === 1
                                            ? 'bg-gradient-to-r from-amber-500 to-orange-500 shadow-lg shadow-amber-500/30'
                                            : 'bg-dark-700 border border-white/10'
                                            }`}
                                    >
                                        <div className={`absolute w-6 h-6 bg-white rounded-full shadow-md transition-all duration-300 ${useFsrs === 1 ? 'left-7' : 'left-1'
                                            }`} />
                                    </button>
                                </div>
                                {useFsrs === 1 && (
                                    <div className="mt-3 flex items-center gap-2 text-amber-400/80 text-[10px] font-medium">
                                        <span className="animate-pulse">⚡</span>
                                        <span>FSRS enabled — new reviews will use adaptive scheduling.</span>
                                    </div>
                                )}
                            </div>

                            {error && (
                                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs text-center animate-shake">
                                    {error}
                                </div>
                            )}

                            <div className="pt-2">
                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className={`w-full font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-3 active:scale-[0.98] group ${saving
                                            ? 'bg-dark-700 text-dark-400 cursor-not-allowed shadow-none'
                                            : 'bg-gradient-to-r from-indigo-500 to-primary-600 hover:from-indigo-400 hover:to-primary-500 text-white shadow-xl shadow-indigo-500/20 hover:shadow-indigo-500/40'
                                        }`}
                                >
                                    {saving ? (
                                        <>
                                            <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                                            <span>Calibrating...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Save className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                                            <span>Save Calibration</span>
                                        </>
                                    )}
                                </button>
                                <p className="text-[10px] text-center text-dark-500 mt-4 font-medium uppercase tracking-[0.2em]">
                                    {saving ? 'UPDATING NEURAL WEIGHTS' : 'Synchronizing with circadian model'}
                                </p>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default CognitiveSettingsModal;
