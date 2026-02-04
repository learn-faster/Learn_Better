import React, { useState, useEffect } from 'react';
import { FaPlay, FaPause, FaStop, FaCoffee, FaCheck, FaLightbulb } from 'react-icons/fa';
import GapJournal from './GapJournal';
import studyService from '../services/study';
import { META_STAGES, REFLECTIVE_PROMPTS, EFFECTIVENESS_RATINGS } from '../constants/metacognition';

const SmartTimer = () => {
    // Timer state
    const [timeLeft, setTimeLeft] = useState(45 * 60);
    const [isActive, setIsActive] = useState(false);
    const [mode, setMode] = useState('WORK'); // WORK, BREAK
    const [studyType, setStudyType] = useState('semantic'); // semantic, procedural
    const [sessionCount, setSessionCount] = useState(0);

    // Metacognition State
    const [activeSessionId, setActiveSessionId] = useState(null);
    const [showPlanModal, setShowPlanModal] = useState(false);
    const [showReflectModal, setShowReflectModal] = useState(false);
    const [monitorPrompt, setMonitorPrompt] = useState(null);

    // Form State
    const [goal, setGoal] = useState('');
    const [successCriteria, setSuccessCriteria] = useState('');
    const [reflection, setReflection] = useState('');
    const [effectivenessRating, setEffectivenessRating] = useState(3);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Initial durations
    const durations = {
        semantic: {
            work: 45 * 60,
            break: 10 * 60,
            label: "Concept Absorption",
            subtitle: "Deep understanding & mental models",
            color: "indigo",
            protocol: "Wakeful Rest (No Phone!)"
        },
        procedural: {
            work: 25 * 60,
            break: 5 * 60,
            label: "Reflex Refinement",
            subtitle: "Problem solving & flow state",
            color: "emerald",
            protocol: "Micro-Break (Movement!)"
        }
    };

    const toggleTimer = () => setIsActive(!isActive);

    const resetTimer = () => {
        setIsActive(false);
        setMode('WORK');
        setTimeLeft(durations[studyType].work);
    };

    const extendTimer = () => {
        setTimeLeft(prev => prev + 5 * 60);
    };

    // Monitoring Logic - Random prompts every ~15 mins
    useEffect(() => {
        if (!isActive || mode === 'BREAK') return;

        const monitorInterval = setInterval(() => {
            // 20% chance every check to show a prompt (to make it random)
            if (Math.random() > 0.7) {
                const prompts = REFLECTIVE_PROMPTS[META_STAGES.MONITORING];
                const randomPrompt = prompts[Math.floor(Math.random() * prompts.length)];
                setMonitorPrompt(randomPrompt);

                // Auto-hide after 15s
                setTimeout(() => setMonitorPrompt(null), 15000);
            }
        }, 10 * 60 * 1000); // Check every 10 mins

        return () => clearInterval(monitorInterval);
    }, [isActive, mode]);

    // Handlers
    const handlePlayPause = () => {
        if (isActive) {
            setIsActive(false); // Pause
            return;
        }

        // If resuming or starting break, just play
        if (activeSessionId || mode === 'BREAK') {
            setIsActive(true);
            return;
        }

        // If new work session, show plan modal
        setShowPlanModal(true);
    };

    const confirmStartSession = async () => {
        setIsSubmitting(true);
        try {
            const session = await studyService.startSession({
                goal,
                success_criteria: successCriteria,
                study_type: studyType
            });
            setActiveSessionId(session.id);
            setIsActive(true);
            setShowPlanModal(false);
        } catch (error) {
            console.error("Failed to start session:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleStop = () => {
        if (!activeSessionId) {
            resetTimer();
            return;
        }
        // Pause timer and show reflection
        setIsActive(false);
        setShowReflectModal(true);
    };

    const confirmEndSession = async () => {
        setIsSubmitting(true);
        try {
            await studyService.endSession(activeSessionId, {
                reflection,
                effectiveness_rating: effectivenessRating
            });
            setActiveSessionId(null);
            setShowReflectModal(false);

            // Reset for next time
            setGoal('');
            setSuccessCriteria('');
            setReflection('');
            resetTimer();
        } catch (error) {
            console.error("Failed to end session:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const skipPhase = () => {
        if (mode === 'WORK') {
            setMode('BREAK');
            setTimeLeft(durations[studyType].break);
            setSessionCount(prev => prev + 1);
        } else {
            setMode('WORK');
            setTimeLeft(durations[studyType].work);
        }
    };

    const handleTypeChange = (type) => {
        if (isActive) return;
        setStudyType(type);
        setTimeLeft(durations[type].work);
    };

    useEffect(() => {
        let interval = null;
        if (isActive && timeLeft > 0) {
            interval = setInterval(() => {
                setTimeLeft(prev => prev - 1);
            }, 1000);
        } else if (timeLeft === 0 && isActive) {
            setIsActive(false);
            if (mode === 'WORK') {
                setSessionCount(prev => prev + 1);
                setMode('BREAK');
                setTimeLeft(durations[studyType].break);
            } else {
                setMode('WORK');
                setTimeLeft(durations[studyType].work);
            }
        }
        return () => clearInterval(interval);
    }, [isActive, timeLeft, mode, studyType]);

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const currentDuration = mode === 'WORK' ? durations[studyType].work : durations[studyType].break;
    const progress = (timeLeft / currentDuration) * 100;
    const strokeDasharray = 2 * Math.PI * 45; // Radius 45
    const strokeDashoffset = (progress / 100) * strokeDasharray;

    const glowColors = {
        indigo: 'bg-indigo-500',
        emerald: 'bg-emerald-500',
        orange: 'bg-orange-500'
    };

    const themeColor = mode === 'WORK' ? durations[studyType].color : 'orange';

    return (
        <>
            <div className="relative group overflow-hidden rounded-3xl bg-white/40 dark:bg-gray-900/40 backdrop-blur-xl border border-white/20 dark:border-white/10 shadow-2xl p-8 transition-all duration-500 hover:shadow-indigo-500/10">
                {/* Animated Background Glow */}
                <div className={`absolute -top-24 -right-24 w-64 h-64 rounded-full blur-3xl opacity-20 transition-colors duration-1000 ${glowColors[themeColor]}`} />

                <div className="relative flex flex-col lg:flex-row items-center gap-10">
                    {/* Timer Section */}
                    <div className="flex flex-col items-center">
                        <div className="relative w-48 h-48 flex items-center justify-center">
                            {/* Circular Progress SVG */}
                            <svg className="absolute w-full h-full -rotate-90">
                                <circle
                                    cx="50%" cy="50%" r="45%"
                                    className="stroke-gray-100 dark:stroke-gray-800 fill-none"
                                    strokeWidth="8"
                                />
                                <circle
                                    cx="50%" cy="50%" r="45%"
                                    className={`transition-all duration-1000 ease-linear fill-none ${themeColor === 'indigo' ? 'stroke-indigo-500' : themeColor === 'emerald' ? 'stroke-emerald-500' : 'stroke-orange-500'}`}
                                    strokeWidth="8"
                                    strokeDasharray={strokeDasharray}
                                    strokeDashoffset={strokeDashoffset}
                                    strokeLinecap="round"
                                />
                            </svg>

                            <div className="flex flex-col items-center">
                                <span className="text-4xl font-bold font-mono tracking-tighter text-gray-800 dark:text-white">
                                    {formatTime(timeLeft)}
                                </span>
                                <span className="text-[10px] uppercase tracking-widest font-semibold opacity-50">
                                    {mode} PHASE
                                </span>
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={handlePlayPause}
                                className={`group relative flex items-center justify-center w-14 h-14 rounded-2xl text-white shadow-lg transition-all active:scale-95 ${isActive ? 'bg-amber-500 hover:bg-amber-600' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                            >
                                {isActive ? <FaPause size={18} /> : <FaPlay size={18} className="translate-x-0.5" />}
                            </button>
                            <button
                                onClick={handleStop}
                                className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-gray-800 dark:hover:text-white transition-all active:scale-95"
                            >
                                <FaStop size={18} />
                            </button>
                            <button
                                onClick={extendTimer}
                                title="+5 Minutes"
                                className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-emerald-500 transition-all active:scale-95"
                            >
                                <span className="text-sm font-bold">+5</span>
                            </button>
                        </div>

                        <div className="flex gap-2 mt-6 p-1 bg-gray-100/50 dark:bg-white/5 rounded-2xl backdrop-blur-sm">
                            {Object.entries(durations).map(([key, config]) => (
                                <button
                                    key={key}
                                    onClick={() => handleTypeChange(key)}
                                    className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${studyType === key ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                                >
                                    {config.label.split(' ')[0]}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Info & Content Section */}
                    <div className="flex-1 w-full space-y-6 lg:border-l lg:pl-10 border-gray-100 dark:border-white/5">
                        <div>
                            <div className="flex items-start justify-between">
                                <div>
                                    <h3 className={`text-2xl font-bold tracking-tight bg-gradient-to-r from-gray-900 to-gray-500 dark:from-white dark:to-gray-400 bg-clip-text text-transparent`}>
                                        {mode === 'WORK' ? durations[studyType].label : 'Time to Recharge'}
                                    </h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                        {mode === 'WORK' ? durations[studyType].subtitle : 'Switch off from intense cognition'}
                                    </p>
                                </div>
                                <div className="px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-500 text-[10px] font-bold uppercase tracking-widest border border-indigo-500/20">
                                    Session #{sessionCount + 1}
                                </div>
                            </div>

                            {mode === 'BREAK' ? (
                                <div className="mt-4 p-4 rounded-2xl bg-orange-500/5 border border-orange-500/10 space-y-2">
                                    <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400 font-bold text-xs uppercase tracking-tighter">
                                        <FaCoffee size={12} /> Science-Backed Protocol
                                    </div>
                                    <p className="text-sm font-medium text-orange-900/80 dark:text-orange-200/80 leading-relaxed italic">
                                        "{durations[studyType].protocol}"
                                    </p>
                                </div>
                            ) : (
                                <div className="mt-4 flex gap-2">
                                    <button
                                        onClick={skipPhase}
                                        className="text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:text-indigo-500 transition-colors"
                                    >
                                        Skip to break →
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="pt-2">
                            <GapJournal />
                        </div>
                    </div>
                </div>
            </div>

            {/* Monitoring Toast */}
            {
                monitorPrompt && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 animate-in slide-in-from-top-4 fade-in duration-500">
                        <div className="bg-indigo-900/90 backdrop-blur-md text-white px-6 py-3 rounded-full shadow-xl border border-indigo-500/30 flex items-center gap-3">
                            <FaLightbulb className="text-yellow-400 animate-pulse" />
                            <span className="text-sm font-medium">{monitorPrompt}</span>
                        </div>
                    </div>
                )
            }

            {/* Planning Modal */}
            {
                showPlanModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
                        <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-3xl p-8 shadow-2xl border border-white/10 m-4">
                            <h3 className="text-2xl font-bold bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent mb-6">
                                Session Planning
                            </h3>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase text-gray-500 mb-2">Micro-Goal</label>
                                    <input
                                        value={goal}
                                        onChange={e => setGoal(e.target.value)}
                                        placeholder="What specific concept will you master?"
                                        className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-xl p-4 text-gray-800 dark:text-white focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold uppercase text-gray-500 mb-2">Success Criteria</label>
                                    <textarea
                                        value={successCriteria}
                                        onChange={e => setSuccessCriteria(e.target.value)}
                                        placeholder="I'll know I've learned it when..."
                                        className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-xl p-4 text-gray-800 dark:text-white focus:ring-2 focus:ring-indigo-500 h-24 resize-none"
                                    />
                                </div>

                                <div className="flex gap-3 pt-4">
                                    <button
                                        onClick={() => setShowPlanModal(false)}
                                        className="flex-1 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={confirmStartSession}
                                        disabled={!goal || isSubmitting}
                                        className="flex-1 py-3 rounded-xl font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
                                    >
                                        {isSubmitting ? 'Starting...' : 'Start Focus'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Reflection Modal */}
            {
                showReflectModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
                        <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-3xl p-8 shadow-2xl border border-white/10 m-4">
                            <h3 className="text-2xl font-bold bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent mb-2">
                                Session Complete
                            </h3>
                            <p className="text-gray-500 text-sm mb-6">Take a moment to consolidate your learning.</p>

                            <div className="space-y-6">
                                <div>
                                    <label className="block text-xs font-bold uppercase text-gray-500 mb-2">Reflection</label>
                                    <textarea
                                        value={reflection}
                                        onChange={e => setReflection(e.target.value)}
                                        placeholder="What stuck? What was hard?"
                                        className="w-full bg-gray-50 dark:bg-gray-800 border-none rounded-xl p-4 text-gray-800 dark:text-white focus:ring-2 focus:ring-emerald-500 h-24 resize-none"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold uppercase text-gray-500 mb-3">Effectiveness Rating</label>
                                    <div className="flex justify-between gap-1">
                                        {[1, 2, 3, 4, 5].map((rate) => (
                                            <button
                                                key={rate}
                                                onClick={() => setEffectivenessRating(rate)}
                                                className={`w-10 h-10 rounded-xl font-bold text-sm transition-all ${effectivenessRating === rate
                                                    ? 'bg-emerald-500 text-white scale-110 shadow-lg shadow-emerald-500/30'
                                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30'
                                                    }`}
                                            >
                                                {rate}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-center text-xs mt-2 text-emerald-600 font-medium">
                                        {EFFECTIVENESS_RATINGS.find(r => r.value === effectivenessRating)?.label}
                                    </p>
                                </div>

                                <div className="pt-2">
                                    <button
                                        onClick={confirmEndSession}
                                        disabled={isSubmitting}
                                        className="w-full py-4 rounded-xl font-bold bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:scale-[1.02] transition-transform active:scale-[0.98]"
                                    >
                                        {isSubmitting ? 'Saving...' : 'Complete Session'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }
        </>
    );
};

export default SmartTimer;
