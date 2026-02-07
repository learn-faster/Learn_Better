import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, CheckCircle, Circle, Clock, Book, Play, HelpCircle, Trophy, RefreshCw, X, Search, Sparkles, AlertCircle, ArrowRight, BrainCircuit, BookOpen, Heart, Flame, Lock, Crown, Trash2 } from 'lucide-react';


import ReactMarkdown from 'react-markdown';
import curriculumService from '../services/curriculum';

// ============================================================================
// THE COGNITIVE QUEST - GAMIFIED CURRICULUM VIEW
// ============================================================================

const CurriculumView = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [curriculum, setCurriculum] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeModule, setActiveModule] = useState(null);

    // Gamification State (MVP: in-memory, could be persisted later)
    const [hearts, setHearts] = useState(5);
    const [streak, setStreak] = useState(3);

    useEffect(() => {
        fetchCurriculum();
    }, [id]);

    const fetchCurriculum = async () => {
        try {
            const data = await curriculumService.getCurriculum(id);
            setCurriculum(data);
        } catch (error) {
            console.error("Failed to fetch curriculum", error);
        } finally {
            setLoading(false);
        }
    };

    const handleModuleUpdate = (updatedModule) => {
        setCurriculum(prev => ({
            ...prev,
            modules: (prev.modules || []).map(m => m.id === updatedModule.id ? updatedModule : m)
        }));
    };

    const handleDeleteModule = async (moduleId) => {
        if (!window.confirm("Delete this module?")) return;
        try {
            await curriculumService.deleteModule(moduleId);
            setCurriculum(prev => ({
                ...prev,
                modules: prev.modules.filter(m => m.id !== moduleId)
            }));
        } catch (error) {
            console.error("Failed to delete module", error);
        }
    };

    if (loading) return (
        <div className="min-h-screen bg-dark-950 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary-400">Loading Quest...</p>
            </div>
        </div>
    );

    if (!curriculum) return <div className="min-h-screen bg-dark-950 flex items-center justify-center text-white">Curriculum not found</div>;

    const progress = Math.round((curriculum.modules.filter(m => m.is_completed).length / curriculum.modules.length) * 100);

    return (
        <div className="min-h-screen bg-gradient-to-b from-emerald-950/20 via-dark-950 to-dark-950 font-sans text-slate-200 relative overflow-x-hidden">

            {/* ===== HUD (Heads-Up Display) ===== */}
            <header className="fixed top-0 left-0 right-0 z-50 p-4 flex items-center justify-between max-w-3xl mx-auto">
                <button
                    onClick={() => navigate('/curriculum')}
                    className="p-3 rounded-2xl bg-dark-900/80 backdrop-blur-xl border border-white/10 text-slate-400 hover:text-white transition-all"
                >
                    <X className="w-5 h-5" />
                </button>

                {/* Progress Bar */}
                <div className="flex-1 mx-6 h-3 bg-dark-800 rounded-full overflow-hidden border border-white/5">
                    <motion.div
                        className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 1, ease: "circOut" }}
                    />
                </div>

                {/* Hearts */}
                <div className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-dark-900/80 backdrop-blur-xl border border-white/10">
                    <Heart className="w-5 h-5 text-red-500 fill-red-500" />
                    <span className="font-black text-white">{hearts}</span>
                </div>

                {/* Streak */}
                <div className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-dark-900/80 backdrop-blur-xl border border-white/10 ml-2">
                    <Flame className="w-5 h-5 text-orange-500" />
                    <span className="font-black text-white">{streak}</span>
                </div>
            </header>

            {/* ===== THE PATH ===== */}
            <main className="relative z-10 pt-28 pb-32 flex flex-col items-center">

                {/* Title Section */}
                <motion.div
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="text-center mb-16"
                >
                    <span className="text-6xl mb-4 block">{curriculum.icon}</span>
                    <h1 className="text-3xl font-black text-white tracking-tight mb-2">{curriculum.title}</h1>
                    <p className="text-slate-500 text-sm max-w-xs mx-auto">{curriculum.description || "Master this path to unlock new knowledge."}</p>
                </motion.div>

                {/* Path Container */}
                <div className="relative flex flex-col items-center gap-0">
                    {/* The Connecting Path Line */}
                    <div className="absolute top-0 bottom-0 w-1 bg-dark-800 rounded-full z-0" />
                    <motion.div
                        className="absolute top-0 w-1 bg-gradient-to-b from-emerald-500 to-emerald-400 rounded-full z-0"
                        initial={{ height: 0 }}
                        animate={{ height: `${progress}%` }}
                        transition={{ duration: 1.5, ease: "circOut" }}
                    />

                    {curriculum.modules && curriculum.modules.length > 0 ? (
                        curriculum.modules.map((module, index) => {
                            const isLocked = index > 0 && !curriculum.modules[index - 1].is_completed && !module.is_completed;
                            const isActive = !module.is_completed && (index === 0 || curriculum.modules[index - 1].is_completed);

                            return (
                                <PathNode
                                    key={module.id}
                                    module={module}
                                    index={index}
                                    isLocked={isLocked}
                                    isActive={isActive}
                                    themeColor={curriculum.theme_color}
                                    onOpen={() => !isLocked && setActiveModule(module)}
                                    onDelete={() => handleDeleteModule(module.id)}
                                />
                            );
                        })
                    ) : (
                        <div className="flex flex-col items-center gap-4 py-12">
                            <Sparkles className="w-12 h-12 text-slate-700" />
                            <p className="text-slate-500 font-medium">No path modules found.</p>
                        </div>
                    )}
                </div>
            </main>

            <AnimatePresence>
                {activeModule && (
                    <StudySession
                        module={activeModule}
                        curriculumId={id}
                        hearts={hearts}
                        setHearts={setHearts}
                        streak={streak}
                        onClose={() => setActiveModule(null)}
                        onUpdate={handleModuleUpdate}
                    />
                )}
            </AnimatePresence>
        </div>
    );

};

// ============================================================================
// PATH NODE COMPONENT (Duolingo-Style Circular Node)
// ============================================================================
const PathNode = ({ module, index, isLocked, isActive, themeColor, onOpen, onDelete }) => {
    const isCompleted = module.is_completed;
    const isEven = index % 2 === 0;

    return (
        <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: index * 0.1 + 0.2, type: "spring", stiffness: 200 }}
            className={`relative z-10 flex flex-col items-center py-6 ${isEven ? 'mr-20' : 'ml-20'}`}
        >
            {/* START Label for Active Node */}
            {isActive && (
                <motion.div
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="absolute -top-2 px-4 py-1.5 bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest rounded-full shadow-lg shadow-emerald-500/30 z-20"
                >
                    Start
                </motion.div>
            )}

            {/* Utility Buttons Container */}
            <div className="absolute -right-12 top-0 flex flex-col gap-2">
                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    className="p-2 rounded-xl bg-dark-800/50 hover:bg-red-500/20 text-slate-600 hover:text-red-400 transition-all border border-white/5 opacity-0 group-hover:opacity-100"
                    title="Delete Module"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>

            {/* The Node Button */}
            <button
                onClick={onOpen}
                disabled={isLocked}
                className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 border-4 shadow-2xl group
                    ${isCompleted
                        ? 'bg-gradient-to-br from-amber-400 to-amber-500 border-amber-300 scale-100'
                        : isActive
                            ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 border-emerald-400 scale-110 ring-8 ring-emerald-500/20'
                            : isLocked
                                ? 'bg-dark-800 border-dark-700 grayscale cursor-not-allowed'
                                : 'bg-dark-800 border-dark-600'
                    }
                `}
            >
                {/* Pulsing Glow for Active */}
                {isActive && (
                    <motion.div
                        className="absolute inset-0 rounded-full bg-emerald-400"
                        animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0, 0.3] }}
                        transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                    />
                )}

                {/* Icon/Number */}
                <div className="relative z-10">
                    {isLocked ? (
                        <Lock className="w-6 h-6 text-dark-500" />
                    ) : isCompleted ? (
                        <Crown className="w-8 h-8 text-amber-900" />
                    ) : (
                        <span className="text-2xl font-black text-white">{index + 1}</span>
                    )}
                </div>
            </button>

            {/* Module Title */}
            <p className={`mt-4 text-sm font-bold text-center max-w-[120px] leading-tight
                ${isLocked ? 'text-dark-600' : isActive ? 'text-white' : 'text-slate-400'}
            `}>
                {module.title}
            </p>

            {/* Practice Button for Completed */}
            {isCompleted ? (
                <button
                    onClick={onOpen}
                    className="mt-2 text-[10px] font-black uppercase tracking-widest text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                    Practice
                </button>
            ) : !isLocked && (
                <button
                    onClick={onOpen}
                    className={`mt-2 text-[10px] font-black uppercase tracking-widest transition-colors ${isActive ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`}
                >
                    Start Session
                </button>
            )}
        </motion.div>
    );
};


const ModuleCard = ({ module, index, isLocked, isActive, themeColor, onOpen }) => {
    return (
        <motion.div
            initial={{ x: -40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: index * 0.1, type: "spring", stiffness: 100 }}
            className={`relative pl-24 group transition-all duration-500 ${isLocked ? 'opacity-40 grayscale pointer-events-none' : 'opacity-100'}`}
        >
            {/* Sequential Connector Node */}
            <button
                onClick={!isLocked ? onOpen : undefined}
                className={`absolute left-0 top-2 w-20 h-20 rounded-2xl border-2 flex items-center justify-center transition-all duration-500 z-10 shadow-2xl overflow-hidden
                    ${module.is_completed
                        ? 'bg-emerald-500 border-emerald-400 text-white scale-110 shadow-emerald-500/20'
                        : isActive
                            ? 'bg-dark-900 border-white text-white scale-100 ring-8 ring-white/5'
                            : 'bg-dark-900 border-white/10 text-slate-600'
                    }
                `}
                style={{
                    borderColor: module.is_completed ? '#34d399' : isActive ? '#ffffff' : 'rgba(255,255,255,0.1)',
                    boxShadow: isActive ? `0 0 30px ${themeColor || '#8b5cf6'}44` : undefined
                }}
            >
                {/* Background Glow for Active */}
                {isActive && (
                    <motion.div
                        animate={{ opacity: [0.1, 0.3, 0.1] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                        className="absolute inset-0 bg-white"
                    />
                )}
                <div className="relative z-10 flex flex-col items-center">
                    {module.is_completed ? <CheckCircle className="w-8 h-8" /> : <span className="text-2xl font-black italic tracking-tighter">{index + 1}</span>}
                </div>
            </button>

            {/* Content Glass Card */}
            <div
                onClick={!isLocked ? onOpen : undefined}
                className={`card-premium relative cursor-pointer group-hover:border-white/20 group-hover:translate-x-2
                    ${isActive ? 'border-white/30 bg-white/5' : 'border-white/5'}
                `}
            >
                <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-2xl bg-white/5 text-slate-400 group-hover:text-white transition-colors border border-white/5">
                            {getModuleIcon(module.module_type)}
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary-400 mb-1">
                                Section {index + 1} • {module.module_type}
                            </span>
                            <h3 className="text-2xl font-black text-white group-hover:text-primary-400 transition-colors tracking-tight">
                                {module.title}
                            </h3>
                        </div>
                    </div>
                </div>

                <p className="text-slate-400 leading-relaxed mb-6 font-medium max-w-2xl">
                    {module.description || "Synthesizing specialized knowledge for cognitive acceleration."}
                </p>

                <div className="flex items-center justify-between pt-4 border-t border-white/5">
                    <div className="flex items-center gap-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {module.estimated_time || '10 min'}</span>
                        <span className="w-1 h-1 rounded-full bg-slate-800" />
                        <span>Adaptive AI Content</span>
                    </div>
                    <button
                        className="px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 group/btn border border-white/5 hover:bg-white hover:text-dark-950"
                        style={{ color: isActive ? '#fff' : undefined }}
                    >
                        {module.is_completed ? 'Refortify Knowledge' : 'Initiate Session'} <ArrowRight className="w-3.5 h-3.5 group-hover/btn:translate-x-1 transition-transform" />
                    </button>
                </div>
            </div>
        </motion.div>
    );
};

// ============================================================================
// STUDY SESSION COMPONENT (The Core Gamified Loop)
// ============================================================================
const StudySession = ({ module, curriculumId, hearts, setHearts, streak, onClose, onUpdate }) => {
    const [status, setStatus] = useState(module.content ? 'ready' : 'pending');
    const [content, setContent] = useState(module.content);
    const [error, setError] = useState(null);
    const [step, setStep] = useState(0);
    const [showAnswer, setShowAnswer] = useState(false);
    const [feedback, setFeedback] = useState(null); // 'correct' | 'incorrect' | null
    const [correctCount, setCorrectCount] = useState(0);
    const [showComplete, setShowComplete] = useState(false);

    const handleGenerate = async () => {
        setStatus('generating');
        try {
            const data = await curriculumService.generateModuleContent(curriculumId, module.id);
            // The service now returns the module object, and data.content is the generated content
            setContent(data.content);
            setStatus('ready');
        } catch (err) {
            setError(err.response?.data?.detail || "Connection to Neural Engine failed.");
            setStatus('error');
        }
    };

    useEffect(() => {
        if (!module.content) {
            handleGenerate();
        }
    }, [module.id]);

    // Parse content into flashcard items
    const getItems = () => {
        let parsedContent = content;
        if (typeof content === 'string' && (content.trim().startsWith('[') || content.trim().startsWith('{'))) {
            try { parsedContent = JSON.parse(content); } catch (e) { /* ignore */ }
        }
        return Array.isArray(parsedContent) ? parsedContent : (parsedContent?.questions || parsedContent?.cards || parsedContent?.steps || []);
    };

    const items = getItems();
    const currentItem = items[step];
    const totalItems = items.length;
    const progress = totalItems > 0 ? ((step + 1) / totalItems) * 100 : 0;

    const handleGotIt = () => {
        setFeedback('correct');
        setCorrectCount(prev => prev + 1);
        setTimeout(() => {
            setFeedback(null);
            setShowAnswer(false);
            if (step < totalItems - 1) {
                setStep(prev => prev + 1);
            } else {
                handleFinish();
            }
        }, 800);
    };

    const handleMissedIt = () => {
        setFeedback('incorrect');
        setHearts(prev => Math.max(0, prev - 1));
        setTimeout(() => {
            setFeedback(null);
            setShowAnswer(false);
            if (step < totalItems - 1) {
                setStep(prev => prev + 1);
            } else {
                handleFinish();
            }
        }, 1000);
    };

    const handleFinish = () => {
        setShowComplete(true);
    };

    const handleComplete = async () => {
        setStatus('completing');
        try {
            await curriculumService.toggleModule(module.id);
            onUpdate({ ...module, is_completed: true });
            onClose();
        } catch (err) {
            setError("Failed to sync progress.");
            setStatus('error');
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-gradient-to-b from-dark-900 to-dark-950 flex flex-col overflow-hidden"
        >
            {/* ===== TOP BAR ===== */}
            <header className="p-4 flex items-center gap-4 border-b border-white/5 bg-dark-900/80 backdrop-blur-xl">
                <button
                    onClick={onClose}
                    className="p-3 rounded-2xl hover:bg-white/10 text-slate-400 hover:text-white transition-all"
                >
                    <X className="w-6 h-6" />
                </button>

                {/* Progress Bar */}
                <div className="flex-1 h-3 bg-dark-800 rounded-full overflow-hidden">
                    <motion.div
                        className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                    />
                </div>

                {/* Hearts */}
                <div className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-dark-800 border border-white/5">
                    <Heart className="w-5 h-5 text-red-500 fill-red-500" />
                    <span className="font-black text-white">{hearts}</span>
                </div>
            </header>

            {/* ===== MAIN CONTENT AREA ===== */}
            <div className="flex-1 flex flex-col items-center justify-center p-6 overflow-y-auto">
                <AnimatePresence mode="wait">
                    {status === 'generating' ? (
                        <motion.div
                            key="generating"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="flex flex-col items-center justify-center space-y-6"
                        >
                            <div className="w-20 h-20 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
                            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Generating content...</p>
                        </motion.div>
                    ) : status === 'error' ? (
                        <motion.div
                            key="error"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="flex flex-col items-center text-center max-w-sm"
                        >
                            <AlertCircle className="w-16 h-16 text-red-400 mb-6" />
                            <h3 className="text-2xl font-black text-white mb-4">Oops!</h3>
                            <p className="text-red-400/80 mb-6">{error}</p>
                            <button onClick={handleGenerate} className="btn-primary px-8 py-3 rounded-xl">Retry</button>
                        </motion.div>
                    ) : currentItem ? (
                        <motion.div
                            key={step}
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ x: feedback === 'correct' ? 100 : feedback === 'incorrect' ? -100 : 0, opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            className={`w-full max-w-2xl p-8 md:p-12 rounded-[2rem] border-2 transition-all shadow-2xl
                                ${feedback === 'correct' ? 'bg-emerald-500/10 border-emerald-500' :
                                    feedback === 'incorrect' ? 'bg-red-500/10 border-red-500 animate-shake' :
                                        'bg-dark-800/50 border-white/10'}
                            `}
                        >
                            {/* Question */}
                            <div className="text-center mb-8">
                                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-4">
                                    Card {step + 1} of {totalItems}
                                </p>
                                <div className="text-2xl md:text-3xl font-bold text-white leading-tight">
                                    <ReactMarkdown>{currentItem.front || currentItem.question}</ReactMarkdown>
                                </div>
                            </div>

                            {/* Answer / Reveal */}
                            <AnimatePresence mode="wait">
                                {showAnswer ? (
                                    <motion.div
                                        key="answer"
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="text-center"
                                    >
                                        <div className="py-6 border-t border-white/10 mb-6">
                                            <p className="text-lg text-emerald-300 font-medium leading-relaxed">
                                                <ReactMarkdown>{currentItem.back || currentItem.answer || currentItem.correct_answer}</ReactMarkdown>
                                            </p>
                                        </div>

                                        {/* Got it / Missed it Buttons */}
                                        <div className="flex gap-4 justify-center">
                                            <motion.button
                                                whileHover={{ scale: 1.05 }}
                                                whileTap={{ scale: 0.95 }}
                                                onClick={handleMissedIt}
                                                disabled={feedback !== null}
                                                className="flex-1 max-w-[150px] py-4 rounded-2xl bg-red-500/20 border-2 border-red-500 text-red-300 font-black text-sm uppercase tracking-wide hover:bg-red-500 hover:text-white transition-all disabled:opacity-50"
                                            >
                                                Missed it
                                            </motion.button>
                                            <motion.button
                                                whileHover={{ scale: 1.05 }}
                                                whileTap={{ scale: 0.95 }}
                                                onClick={handleGotIt}
                                                disabled={feedback !== null}
                                                className="flex-1 max-w-[150px] py-4 rounded-2xl bg-emerald-500/20 border-2 border-emerald-500 text-emerald-300 font-black text-sm uppercase tracking-wide hover:bg-emerald-500 hover:text-white transition-all disabled:opacity-50"
                                            >
                                                Got it!
                                            </motion.button>
                                        </div>
                                    </motion.div>
                                ) : (
                                    <motion.div key="reveal" className="flex justify-center">
                                        <motion.button
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={() => setShowAnswer(true)}
                                            className="px-12 py-4 rounded-2xl bg-white text-dark-950 font-black uppercase tracking-widest text-sm shadow-lg hover:shadow-xl transition-all"
                                        >
                                            Reveal Answer
                                        </motion.button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    ) : (
                        <p className="text-slate-500">No cards available.</p>
                    )}
                </AnimatePresence>
            </div>

            {/* ===== LESSON COMPLETE MODAL ===== */}
            <AnimatePresence>
                {showComplete && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[150] bg-dark-950/95 backdrop-blur-xl flex items-center justify-center p-4"
                    >
                        <motion.div
                            initial={{ scale: 0.8, y: 50 }}
                            animate={{ scale: 1, y: 0 }}
                            className="bg-gradient-to-br from-dark-800 to-dark-900 rounded-[2rem] p-10 md:p-16 text-center max-w-md w-full border border-white/10 shadow-2xl"
                        >
                            {/* Trophy Icon */}
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
                                className="mx-auto w-24 h-24 bg-gradient-to-br from-amber-400 to-amber-500 rounded-full flex items-center justify-center mb-8 shadow-lg shadow-amber-500/30"
                            >
                                <Trophy className="w-12 h-12 text-amber-900" />
                            </motion.div>

                            <h2 className="text-3xl font-black text-white mb-2">Lesson Complete!</h2>
                            <p className="text-slate-500 mb-8">Great work on this module.</p>

                            {/* Stats */}
                            <div className="flex justify-center gap-8 mb-10">
                                <div className="text-center">
                                    <p className="text-4xl font-black text-emerald-400">{Math.round((correctCount / totalItems) * 100)}%</p>
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Accuracy</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-4xl font-black text-primary-400">+{correctCount * 10}</p>
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">XP</p>
                                </div>
                            </div>

                            {/* Continue Button */}
                            <motion.button
                                whileHover={{ scale: 1.03 }}
                                whileTap={{ scale: 0.97 }}
                                onClick={handleComplete}
                                disabled={status === 'completing'}
                                className="w-full py-5 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-black uppercase tracking-widest text-sm shadow-lg shadow-emerald-500/30 hover:shadow-xl transition-all disabled:opacity-50"
                            >
                                {status === 'completing' ? 'Saving...' : 'Continue'}
                            </motion.button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};


const ContentRenderer = ({ type, content, step, setStep }) => {
    const normalizedType = type?.toLowerCase();
    const [showAnswer, setShowAnswer] = useState(false);

    // Reset answer state when step changes
    useEffect(() => {
        setShowAnswer(false);
    }, [step]);

    if (!content) return null;

    // Robust content parsing
    let parsedContent = content;
    if (typeof content === 'string' && (content.trim().startsWith('[') || content.trim().startsWith('{'))) {
        try {
            parsedContent = JSON.parse(content);
        } catch (e) {
            console.warn("Failed to parse content JSON", e);
        }
    }

    if (normalizedType === 'primer' || normalizedType === 'reading') {
        const text = typeof parsedContent === 'string' ? parsedContent : (parsedContent.content || parsedContent.text || JSON.stringify(parsedContent));
        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="markdown-content max-w-none prose prose-invert"
            >
                <ReactMarkdown>{text}</ReactMarkdown>
            </motion.div>
        );
    }

    if (normalizedType === 'srs' || normalizedType === 'flashcards' || normalizedType === 'practice' || normalizedType === 'quiz') {
        const items = Array.isArray(parsedContent) ? parsedContent : (parsedContent.questions || parsedContent.cards || parsedContent.steps || []);
        if (items.length === 0) return <p className="text-slate-500 italic py-12 text-center bg-white/5 rounded-3xl">No data nodes found for this protocol.</p>;

        const item = items[step];
        if (!item) return null;

        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <motion.div
                    key={step}
                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    className="w-full"
                >
                    <div className="bg-white/5 border border-white/10 rounded-[3rem] p-12 md:p-20 text-center relative overflow-hidden group shadow-2xl">
                        {/* Card Ambient Glow */}
                        <div className="absolute -top-32 -left-32 w-64 h-64 bg-primary-500/10 rounded-full blur-[80px] pointer-events-none group-hover:bg-primary-500/20 transition-all duration-1000" />
                        <div className="absolute -bottom-32 -right-32 w-64 h-64 bg-indigo-500/5 rounded-full blur-[80px] pointer-events-none group-hover:bg-indigo-500/15 transition-all duration-1000" />

                        <div className="relative z-10">
                            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary-500/10 border border-primary-500/20 text-primary-400 font-black uppercase tracking-[0.3em] text-[10px] mb-12">
                                <Sparkles className="w-3 h-3" /> Active Recall Protocol
                            </div>

                            <div className="markdown-content text-3xl md:text-4xl font-black text-white leading-tight mb-16 tracking-tight">
                                <ReactMarkdown>{item.front || item.question}</ReactMarkdown>
                            </div>

                            <AnimatePresence mode="wait">
                                {showAnswer ? (
                                    <motion.div
                                        key="answer"
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="pt-16 border-t border-white/10"
                                    >
                                        <div className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400 mb-8 flex items-center justify-center gap-2">
                                            <CheckCircle className="w-3.5 h-3.5" /> Verified Knowledge Node
                                        </div>
                                        <div className="markdown-content text-xl text-slate-300 font-medium leading-relaxed mb-4">
                                            <ReactMarkdown>{item.back || item.answer || item.correct_answer || item.definition}</ReactMarkdown>
                                        </div>
                                        {item.explanation && (
                                            <div className="mt-8 p-6 rounded-2xl bg-white/5 border border-white/5 text-sm text-slate-400 text-left font-medium">
                                                <span className="text-white block mb-1">Context:</span>
                                                {item.explanation}
                                            </div>
                                        )}
                                    </motion.div>
                                ) : (
                                    <motion.button
                                        key="button"
                                        whileHover={{ scale: 1.05, boxShadow: "0 0 30px rgba(139,92,246,0.4)" }}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={() => setShowAnswer(true)}
                                        className="px-12 py-6 rounded-[2rem] bg-white text-dark-950 font-black text-sm uppercase tracking-[0.2em] shadow-2xl hover:bg-primary-400 hover:text-white transition-all mt-4"
                                    >
                                        Reveal Neural Sequence
                                    </motion.button>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="markdown-content bg-white/5 p-12 rounded-[3rem] border border-white/5">
            <ReactMarkdown>{typeof content === 'string' ? content : JSON.stringify(content, null, 2)}</ReactMarkdown>
        </div>
    );
};

const getModuleIcon = (type) => {
    const t = type?.toLowerCase();
    switch (t) {
        case 'video': return <Play className="w-5 h-5" />;
        case 'quiz':
        case 'practice': return <BrainCircuit className="w-5 h-5" />;
        case 'primer': return <Sparkles className="w-5 h-5" />;
        case 'reading': return <BookOpen className="w-5 h-5" />;
        case 'srs': return <RefreshCw className="w-5 h-5" />;
        case 'search': return <Search className="w-5 h-5" />;
        default: return <BookOpen className="w-5 h-5" />;
    }
};

export default CurriculumView;

