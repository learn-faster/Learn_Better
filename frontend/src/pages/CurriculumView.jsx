import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, CheckCircle, Circle, Clock, Book, Play, HelpCircle, Trophy, RefreshCw, X, Search, Sparkles, AlertCircle, ArrowRight, BrainCircuit, BookOpen } from 'lucide-react';


import ReactMarkdown from 'react-markdown';
import curriculumService from '../services/curriculum';

const CurriculumView = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [curriculum, setCurriculum] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeModule, setActiveModule] = useState(null);

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
            modules: prev.modules.map(m => m.id === updatedModule.id ? updatedModule : m)
        }));
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div></div>;
    if (!curriculum) return <div className="p-8">Curriculum not found</div>;

    const progress = Math.round((curriculum.modules.filter(m => m.is_completed).length / curriculum.modules.length) * 100);

    return (
        <div className="min-h-screen bg-dark-950 font-sans text-slate-200 relative overflow-hidden">
            {/* Ambient Background Effects */}
            <div className="universe-stars">
                <div className="star-layer-1" />
                <div className="star-layer-2" />
            </div>

            {/* Dynamic Hero Glow */}
            <div
                className="absolute top-0 left-0 w-full h-[600px] opacity-10 transition-colors duration-1000 ease-in-out blur-[120px] pointer-events-none"
                style={{ backgroundColor: curriculum.theme_color || '#8b5cf6' }}
            />

            <main className="relative z-10 max-w-5xl mx-auto px-6 pt-16 pb-32">
                <button
                    onClick={() => navigate('/curriculum')}
                    className="flex items-center gap-2 text-slate-500 hover:text-white mb-16 group transition-all font-bold uppercase tracking-widest text-[10px]"
                >
                    <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" /> Back to Nexus
                </button>

                <div className="flex flex-col md:flex-row items-center md:items-end justify-between mb-24 gap-10">
                    <div className="text-center md:text-left">
                        <motion.div
                            initial={{ scale: 0, rotate: -20 }}
                            animate={{ scale: 1, rotate: 0 }}
                            className="text-8xl mb-6 filter drop-shadow-[0_0_30px_rgba(255,255,255,0.2)]"
                        >
                            {curriculum.icon}
                        </motion.div>
                        <motion.h1
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            className="text-6xl font-black text-white mb-4 tracking-tighter leading-tight"
                        >
                            {curriculum.title}
                        </motion.h1>
                        <p className="text-slate-400 text-xl max-w-2xl leading-relaxed font-medium">
                            {curriculum.description || "Synthesizing specialized knowledge for cognitive acceleration."}
                        </p>
                    </div>

                    <div className="bg-dark-900/60 p-8 rounded-[2.5rem] border border-white/5 shadow-2xl backdrop-blur-xl flex flex-col items-center">
                        <div className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em] mb-4">Neural Integration</div>
                        <div className="relative w-24 h-24">
                            <svg className="w-full h-full rotate-[-90deg]">
                                <circle cx="48" cy="48" r="40" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                                <motion.circle
                                    cx="48" cy="48" r="40" fill="none"
                                    stroke={curriculum.theme_color || '#8b5cf6'}
                                    strokeWidth="8"
                                    strokeDasharray="251.2"
                                    initial={{ strokeDashoffset: 251.2 }}
                                    animate={{ strokeDashoffset: 251.2 - (progress / 100) * 251.2 }}
                                    transition={{ duration: 2, ease: "circOut" }}
                                    strokeLinecap="round"
                                />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center font-black text-2xl text-white">
                                {progress}<span className="text-[10px] text-slate-500 mt-1">%</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Immersive Pathway Layout */}
                <div className="relative px-4">
                    {/* Glowing Neural Path Link */}
                    <div className="absolute left-[39px] top-10 w-2 h-[calc(100%-80px)] hidden md:block">
                        <div className="w-full h-full bg-white/5 rounded-full relative overflow-hidden">
                            <motion.div
                                className="absolute top-0 left-0 w-full rounded-full shadow-[0_0_20px_rgba(139,92,246,0.5)]"
                                style={{
                                    height: `${progress}%`,
                                    backgroundColor: curriculum.theme_color || '#8b5cf6'
                                }}
                                initial={{ height: 0 }}
                                animate={{ height: `${progress}%` }}
                                transition={{ duration: 2, ease: "circOut" }}
                            />
                            {/* Animated Pulse on the path */}
                            <motion.div
                                className="absolute left-0 w-full h-20 opacity-30 blur-sm"
                                style={{ backgroundColor: curriculum.theme_color || '#ffffff' }}
                                animate={{ top: ["-10%", "110%"] }}
                                transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
                            />
                        </div>
                    </div>

                    <div className="space-y-16">
                        {curriculum.modules.map((module, index) => {
                            const isLocked = index > 0 && !curriculum.modules[index - 1].is_completed && !module.is_completed;
                            const isActive = !module.is_completed && (index === 0 || curriculum.modules[index - 1].is_completed);

                            return (
                                <ModuleCard
                                    key={module.id}
                                    module={module}
                                    index={index}
                                    isLocked={isLocked}
                                    isActive={isActive}
                                    themeColor={curriculum.theme_color}
                                    onOpen={() => setActiveModule(module)}
                                />
                            );
                        })}
                    </div>
                </div>
            </main>

            <AnimatePresence>
                {activeModule && (
                    <ModulePlayer
                        module={activeModule}
                        curriculumId={id}
                        onClose={() => setActiveModule(null)}
                        onUpdate={handleModuleUpdate}
                    />
                )}
            </AnimatePresence>
        </div>
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


const ModulePlayer = ({ module, curriculumId, onClose, onUpdate }) => {
    const [status, setStatus] = useState(module.content ? 'ready' : 'pending');
    const [content, setContent] = useState(module.content);
    const [error, setError] = useState(null);
    const [step, setStep] = useState(0);

    useEffect(() => {
        if (!module.content) {
            handleGenerate();
        }
    }, [module.id]);

    const handleGenerate = async () => {
        setStatus('generating');
        try {
            const data = await curriculumService.generateModuleContent(curriculumId, module.id);
            setContent(data.content);
            setStatus('ready');
        } catch (err) {
            setError(err.response?.data?.detail || "Connection to Neural Engine failed.");
            setStatus('error');
        }
    };

    const handleComplete = async () => {
        setStatus('completing');
        try {
            await curriculumService.toggleModule(module.id);
            onUpdate(module.id, true);
            onClose();
        } catch (err) {
            setError("Failed to sync progress with Nexus.");
            setStatus('error');
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-dark-950 flex items-center justify-center p-0 md:p-10 lg:p-20 overflow-hidden"
        >
            {/* Immersive Background */}
            <div className="absolute inset-0 z-0 overflow-hidden">
                <div className="universe-stars" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-primary-600/5 blur-[150px] rounded-full animate-pulse-slow" />
            </div>

            <motion.div
                layoutId={`module-${module.id}`}
                className="relative z-10 w-full h-full bg-dark-900/60 backdrop-blur-3xl border border-white/5 rounded-none md:rounded-[3rem] shadow-[0_0_100px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden"
            >
                {/* Header with Progress */}
                <header className="p-8 border-b border-white/5 flex items-center justify-between bg-dark-900/40">
                    <div className="flex items-center gap-6">
                        <button
                            onClick={onClose}
                            className="p-3 rounded-2xl hover:bg-white/5 text-slate-500 hover:text-white transition-all border border-white/5"
                        >
                            <X className="w-6 h-6" />
                        </button>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black tracking-[0.3em] text-primary-400 uppercase mb-1">Session Protocol</span>
                            <h2 className="text-xl font-black text-white tracking-tight">{module.title}</h2>
                        </div>
                    </div>
                    {status === 'ready' && Array.isArray(content) && content.length > 1 && (
                        <div className="flex items-center gap-4">
                            <div className="hidden md:flex bg-dark-950 rounded-full h-1.5 w-32 overflow-hidden border border-white/5">
                                <motion.div
                                    className="h-full bg-primary-500"
                                    animate={{ width: `${((step + 1) / content.length) * 100}%` }}
                                />
                            </div>
                            <span className="text-[10px] font-black text-slate-500 tracking-widest">{step + 1} / {content.length}</span>
                        </div>
                    )}
                </header>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-8 md:p-16 lg:p-24 relative">
                    <AnimatePresence mode="wait">
                        {status === 'generating' ? (
                            <motion.div
                                key="generating"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                className="flex flex-col items-center justify-center h-full space-y-10"
                            >
                                <div className="relative w-32 h-32">
                                    <div className="absolute inset-0 border-4 border-white/5 rounded-full" />
                                    <div className="absolute inset-0 border-4 border-primary-500 rounded-full border-t-transparent animate-spin" />
                                    <Sparkles className="absolute inset-0 m-auto w-10 h-10 text-primary-400 animate-pulse" />
                                </div>
                                <div className="text-center">
                                    <h3 className="text-3xl font-black text-white mb-4">Synthesizing Content</h3>
                                    <p className="text-slate-500 font-medium uppercase tracking-[0.2em] text-xs">Accessing specialized knowledge structures...</p>
                                </div>
                            </motion.div>
                        ) : status === 'error' ? (
                            <motion.div
                                key="error"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="flex flex-col items-center justify-center h-full text-center max-w-md mx-auto"
                            >
                                <div className="w-20 h-20 bg-red-500/10 rounded-3xl flex items-center justify-center mb-8 border border-red-500/20">
                                    <AlertCircle className="w-10 h-10 text-red-400" />
                                </div>
                                <h3 className="text-2xl font-black text-white mb-4">Neural Link Severed</h3>
                                <p className="text-red-400/80 bg-red-950/20 p-6 rounded-2xl border border-red-500/10 mb-10">{error}</p>
                                <button
                                    onClick={handleGenerate}
                                    className="btn-primary w-full py-5 rounded-2xl text-[12px] font-black uppercase tracking-widest"
                                >
                                    Re-establish Connection
                                </button>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="content"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="max-w-4xl mx-auto"
                            >
                                <ContentRenderer
                                    type={module.module_type}
                                    content={content}
                                    step={step}
                                    setStep={setStep}
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Footer Controls */}
                {status === 'ready' && (
                    <footer className="p-8 border-t border-white/5 bg-dark-900/40 flex items-center justify-between">
                        <button
                            onClick={onClose}
                            className="px-8 py-4 rounded-2xl bg-white/5 text-slate-400 hover:text-white transition-all font-black text-[10px] uppercase tracking-widest border border-white/5"
                        >
                            Suspend Session
                        </button>

                        <div className="flex gap-4">
                            {step > 0 && (
                                <button
                                    onClick={() => setStep(prev => prev - 1)}
                                    className="px-8 py-4 rounded-2xl bg-white/5 text-white hover:bg-white/10 transition-all font-black"
                                >
                                    <ArrowLeft className="w-5 h-5" />
                                </button>
                            )}

                            {Array.isArray(content) && step < content.length - 1 ? (
                                <button
                                    onClick={() => setStep(prev => prev + 1)}
                                    className="btn-primary px-12 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-primary-500/20"
                                >
                                    Next Phase <ArrowRight className="w-4 h-4" />
                                </button>
                            ) : (
                                <button
                                    onClick={handleComplete}
                                    disabled={status === 'completing'}
                                    className="btn-primary px-12 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest"
                                >
                                    {status === 'completing' ? 'Syncing...' : 'Seal Mastery'} <CheckCircle className="w-4 h-4 ml-2" />
                                </button>
                            )}
                        </div>
                    </footer>
                )}
            </motion.div>
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

