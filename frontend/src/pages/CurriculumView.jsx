import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, CheckCircle, Circle, Clock, Book, Play, HelpCircle, Trophy, RefreshCw, X, Search } from 'lucide-react';
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
        <div className="min-h-screen bg-gray-50 relative font-sans">
            {/* Dynamic Hero Header */}
            <div
                className="w-full h-[300px] absolute top-0 left-0 z-0 transition-colors duration-700 ease-in-out"
                style={{ backgroundColor: curriculum.theme_color || '#3b82f6' }}
            >
                <div className="absolute inset-0 bg-black/10 backdrop-blur-[2px]" />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-gray-50" />
            </div>

            <main className="relative z-10 max-w-4xl mx-auto px-4 pt-24 pb-20">
                <button
                    onClick={() => navigate('/curriculum')}
                    className="flex items-center gap-2 text-white/80 hover:text-white mb-8 transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" /> Back to List
                </button>

                <div className="flex items-start justify-between mb-12">
                    <div>
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="text-6xl mb-4 filter drop-shadow-lg"
                        >
                            {curriculum.icon}
                        </motion.div>
                        <motion.h1
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            className="text-4xl font-bold text-gray-900 mb-2"
                        >
                            {curriculum.title}
                        </motion.h1>
                        <p className="text-gray-600 text-lg max-w-2xl">{curriculum.description}</p>
                    </div>

                    <div className="bg-white p-6 rounded-3xl shadow-lg border border-gray-100 hidden md:block">
                        <div className="text-sm text-gray-500 font-medium mb-2">Overall Progress</div>
                        <div className="text-4xl font-bold flex items-baseline gap-1" style={{ color: curriculum.theme_color || '#3b82f6' }}>
                            {progress}<span className="text-lg text-gray-400">%</span>
                        </div>
                    </div>
                </div>

                {/* Timeline Layout */}
                <div className="relative">
                    <div className="absolute left-8 top-8 bottom-8 w-1 bg-gray-200 rounded-full" />

                    <div className="space-y-8">
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
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: index * 0.1 }}
            className={`relative pl-24 transition-all duration-300 ${isLocked ? 'opacity-50 grayscale blur-[1px]' : 'opacity-100'}`}
        >
            <button
                onClick={!isLocked ? onOpen : undefined}
                className={`absolute left-0 top-1 w-16 h-16 rounded-full border-4 flex items-center justify-center transition-all duration-300 z-10 shadow-sm
                    ${module.is_completed
                        ? 'bg-green-500 border-green-500 text-white scale-110'
                        : isActive
                            ? 'bg-white text-gray-600 scale-100 ring-4 ring-offset-2'
                            : 'bg-white border-gray-200 text-gray-300'
                    }
                `}
                style={{
                    borderColor: module.is_completed ? '#22c55e' : isActive ? themeColor : '#e5e7eb',
                    color: module.is_completed ? 'white' : isActive ? themeColor : '#d1d5db',
                    outlineColor: isActive ? themeColor : 'transparent'
                }}
                disabled={isLocked}
            >
                {module.is_completed ? <CheckCircle className="w-8 h-8" /> : <span className="text-xl font-bold">{index + 1}</span>}
            </button>

            <div
                onClick={!isLocked ? onOpen : undefined}
                className={`bg-white rounded-3xl p-6 border shadow-sm transition-all hover:shadow-md cursor-pointer
                    ${isActive ? 'border-2' : 'border-gray-100'}
                `}
                style={{ borderColor: isActive ? themeColor : undefined }}
            >
                <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-3">
                        <span className={`p-2 rounded-xl bg-gray-50 text-gray-600`}>
                            {getModuleIcon(module.module_type)}
                        </span>
                        <span className="text-xs uppercase tracking-wider font-bold text-gray-400">
                            {module.estimated_time || '5 min'} • {module.module_type}
                        </span>
                    </div>
                </div>

                <h3 className="text-xl font-bold mb-2">{module.title}</h3>
                <p className="text-gray-600 leading-relaxed mb-4">{module.description}</p>

                <div className="flex justify-end">
                    <button className="text-sm font-semibold flex items-center gap-1" style={{ color: themeColor }}>
                        {module.is_completed ? 'Review' : 'Start Lesson'} <ArrowLeft className="rotate-180 w-4 h-4 ml-1" />
                    </button>
                </div>
            </div>
        </motion.div>
    );
};

const ModulePlayer = ({ module, curriculumId, onClose, onUpdate }) => {
    const [status, setStatus] = useState(module.status || 'pending');
    const [generating, setGenerating] = useState(false);
    const [content, setContent] = useState(module.content);
    const [currentStep, setCurrentStep] = useState(0); // For quizzes/flashcards

    useEffect(() => {
        if (module.content) {
            setStatus('ready');
            setContent(module.content);
        }
    }, [module]);

    const handleGenerate = async () => {
        setGenerating(true);
        setStatus('generating');
        try {
            const updatedModule = await curriculumService.generateModuleContent(module.id);
            setContent(updatedModule.content);
            setStatus('ready');
            onUpdate(updatedModule);
        } catch (error) {
            console.error(error);
            setStatus('failed');
        } finally {
            setGenerating(false);
        }
    };

    const handleComplete = async () => {
        try {
            const updatedModule = await curriculumService.toggleModule(curriculumId, module.id);
            // Ensure we set true, toggle API just toggles
            if (!updatedModule.is_completed) {
                // If it toggled off, toggle again? No, assume user knows. 
                // Whatever, let's just close.
            }
            onUpdate(updatedModule);
            onClose();
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        >
            <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
            >
                {/* Header */}
                <div className="border-b p-6 flex items-center justify-between bg-gray-50">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900">{module.title}</h2>
                        <span className="text-sm text-gray-500 uppercase tracking-widest font-semibold">{module.module_type}</span>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                        <X className="w-6 h-6 text-gray-500" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-8 relative min-h-[400px]">
                    {status === 'pending' || status === 'failed' ? (
                        <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
                            <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center">
                                <RefreshCw className={`w-10 h-10 text-blue-500 ${generating ? 'animate-spin' : ''}`} />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold mb-2">
                                    {status === 'failed' ? 'Generation Failed' : 'Ready to Start?'}
                                </h3>
                                <p className="text-gray-500 max-w-md">
                                    {status === 'failed' ? 'Something went wrong.' : 'We need to generate the content for this lesson using AI. This might take a moment.'}
                                </p>
                            </div>
                            <button
                                onClick={handleGenerate}
                                disabled={generating}
                                className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all active:scale-95 disabled:opacity-50"
                            >
                                {generating ? 'Generating Lesson...' : 'Generate Content'}
                            </button>
                        </div>
                    ) : status === 'generating' ? (
                        <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                            <p className="text-gray-500 animate-pulse">Researching and writing content...</p>
                        </div>
                    ) : (
                        <div className="max-w-3xl mx-auto">
                            <ContentRenderer
                                type={module.module_type}
                                content={content}
                                step={currentStep}
                                setStep={setCurrentStep}
                            />
                        </div>
                    )}
                </div>

                {/* Footer */}
                {status === 'ready' && (
                    <div className="border-t p-6 flex justify-end bg-gray-50">
                        <button
                            onClick={handleComplete}
                            className="px-8 py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold shadow-lg shadow-green-200 transition-all active:scale-95 flex items-center gap-2"
                        >
                            <CheckCircle className="w-5 h-5" /> Complete Lesson
                        </button>
                    </div>
                )}
            </motion.div>
        </motion.div>
    );
};

const ContentRenderer = ({ type, content, step, setStep }) => {
    if (!content) return null;

    if (type === 'quiz') {
        // content is list of questions
        const questions = Array.isArray(content) ? content : (content.questions || []);
        if (questions.length === 0) return <p>No questions generated.</p>;

        const q = questions[step];
        const isLast = step === questions.length - 1;

        return (
            <div className="space-y-6">
                <div className="flex items-center justify-between text-sm text-gray-400 font-bold uppercase tracking-widest">
                    <span>Question {step + 1} of {questions.length}</span>
                </div>
                <h3 className="text-2xl font-bold text-gray-800">{q.question}</h3>
                <div className="grid gap-3">
                    {q.options?.map((opt, i) => (
                        <button key={i} className="p-4 text-left rounded-xl border-2 border-gray-100 hover:border-blue-500 hover:bg-blue-50 transition-all font-medium text-gray-700">
                            {opt}
                        </button>
                    ))}
                </div>
                {/* Navigation for demo purposes (real quiz logic needs selection state) */}
                <div className="flex justify-between pt-4">
                    <button disabled={step === 0} onClick={() => setStep(s => s - 1)} className="text-gray-400 disabled:opacity-30 font-bold">Previous</button>
                    <button disabled={isLast} onClick={() => setStep(s => s + 1)} className="text-blue-600 disabled:opacity-30 font-bold">Next Question</button>
                </div>
            </div>
        );
    }

    // Reading or Search or Default
    // content might be { content: "markdown string" } or just "markdown string"
    const text = typeof content === 'string' ? content : (content.content || JSON.stringify(content));

    return (
        <div className="prose prose-lg prose-blue max-w-none">
            <ReactMarkdown>{text}</ReactMarkdown>
        </div>
    );
};

const getModuleIcon = (type) => {
    switch (type) {
        case 'video': return <Play className="w-5 h-5" />;
        case 'quiz': return <HelpCircle className="w-5 h-5" />;
        case 'practice': return <Trophy className="w-5 h-5" />;
        case 'search': return <Search className="w-5 h-5" />;
        default: return <Book className="w-5 h-5" />;
    }
};

export default CurriculumView;
