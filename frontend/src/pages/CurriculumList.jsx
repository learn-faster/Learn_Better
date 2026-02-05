import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Plus, BookOpen, Clock, ChevronRight, GraduationCap, ArrowRight, Sparkles, AlertCircle, BrainCircuit } from 'lucide-react';

import curriculumService from '../services/curriculum';
import api from '../services/api';

const CurriculumList = () => {
    const navigate = useNavigate();
    const [curriculums, setCurriculums] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);

    // Create Modal State
    const [newGoal, setNewGoal] = useState('');
    const [selectedDoc, setSelectedDoc] = useState('');
    const [documents, setDocuments] = useState([]);
    const [creatingStep, setCreatingStep] = useState('idle'); // idle, generating, done, error
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        fetchCurriculums();
        fetchDocuments();
    }, []);

    const fetchCurriculums = async () => {
        try {
            const data = await curriculumService.getCurriculums();
            setCurriculums(data);
        } catch (error) {
            console.error("Failed to load curriculums", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchDocuments = async () => {
        try {
            const res = await api.get('/documents/');
            // Access docs from response (handle array directly or paginated)
            const docs = Array.isArray(res) ? res : (res.items || []);
            setDocuments(docs);
        } catch (error) {
            console.error("Failed to load docs", error);
        }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        setCreatingStep('generating');
        setErrorMessage('');

        try {
            // Hard timeout to prevent infinite spinner
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Request timed out. Please try again.")), 30000)
            );

            const requestPromise = curriculumService.generateCurriculum(newGoal, selectedDoc || null);

            const newCurriculum = await Promise.race([requestPromise, timeoutPromise]);

            setCurriculums([newCurriculum, ...curriculums]);
            setCreatingStep('done');
            setTimeout(() => {
                setIsCreating(false);
                setCreatingStep('idle');
                setNewGoal('');
                setSelectedDoc('');
                navigate(`/curriculum/${newCurriculum.id}`);
            }, 1000);
        } catch (error) {
            console.error("Failed to create", error);
            setCreatingStep('error');
            setErrorMessage(typeof error === 'string' ? error : "Something went wrong. Please check your backend connection.");
        }
    };

    // Animation Variants
    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { staggerChildren: 0.1 }
        }
    };

    const itemVariants = {
        hidden: { y: 20, opacity: 0 },
        visible: { y: 0, opacity: 1 }
    };

    return (
        <div className="min-h-screen bg-dark-950 font-sans text-slate-200 relative overflow-hidden">
            {/* Ambient Background Effects */}
            <div className="universe-stars">
                <div className="star-layer-1" />
                <div className="star-layer-2" />
            </div>
            <div className="absolute top-0 left-0 w-full h-[600px] bg-gradient-to-b from-primary-950/20 to-transparent pointer-events-none" />
            <div className="absolute top-[-10% ] right-[-10% ] w-[60%] h-[60%] bg-primary-600/10 rounded-full blur-[120px] pointer-events-none animate-pulse-slow" />
            <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-dark-950 to-transparent z-0 pointer-events-none" />

            <div className="max-w-7xl mx-auto px-6 py-16 relative z-10">

                {/* Header Section */}
                <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-20 gap-8">
                    <div className="space-y-4">
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-500/10 border border-primary-500/20 text-primary-400 font-bold tracking-wider uppercase text-[10px]"
                        >
                            <Sparkles className="w-3 h-3" /> Cognitive Architect
                        </motion.div>
                        <motion.h1
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            className="text-6xl font-black text-white tracking-tighter leading-tight"
                        >
                            Neural <span className="text-primary-500">Pathways</span>
                        </motion.h1>
                        <motion.p
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.1 }}
                            className="text-lg text-slate-400 max-w-2xl leading-relaxed font-medium"
                        >
                            Design your proprietary knowledge structures. AI-orchestrated learning paths engineered for maximum retention and top-down mastery.
                        </motion.p>
                    </div>
                    <motion.button
                        whileHover={{ scale: 1.05, boxShadow: "0 0 20px rgba(139, 92, 246, 0.4)" }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setIsCreating(true)}
                        className="group relative flex items-center gap-3 bg-white text-dark-950 px-10 py-5 rounded-[2rem] font-black shadow-2xl transition-all overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-primary-400 to-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <span className="relative z-10 flex items-center gap-2 group-hover:text-white transition-colors">
                            <Plus className="w-6 h-6" /> Create New Pathway
                        </span>
                    </motion.button>
                </header>

                {/* Main Content Area */}
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-40 space-y-6">
                        <div className="relative w-24 h-24">
                            <div className="absolute inset-0 border-4 border-white/5 rounded-full" />
                            <div className="absolute inset-0 border-4 border-primary-500 rounded-full border-t-transparent animate-spin" />
                            <BrainCircuit className="absolute inset-0 m-auto w-8 h-8 text-primary-400 animate-pulse" />
                        </div>
                        <p className="text-primary-400 font-bold uppercase tracking-[0.3em] text-[10px]">Mapping Synapses...</p>
                    </div>
                ) : curriculums.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="text-center py-32 glass-morphism rounded-[3rem] border border-white/5"
                    >
                        <div className="w-24 h-24 bg-white/5 rounded-3xl flex items-center justify-center mx-auto mb-8 rotate-12 group-hover:rotate-0 transition-transform">
                            <GraduationCap className="w-12 h-12 text-slate-600" />
                        </div>
                        <h3 className="text-3xl font-black text-white mb-4">The Void of Knowledge</h3>
                        <p className="text-slate-400 mb-10 max-w-md mx-auto text-lg leading-relaxed">No active pathways detected. Start your cognitive expansion today.</p>
                        <button
                            onClick={() => setIsCreating(true)}
                            className="text-primary-400 font-black flex items-center gap-2 mx-auto hover:gap-4 transition-all uppercase tracking-widest text-sm"
                        >
                            Initialize First Path <ArrowRight className="w-5 h-5" />
                        </button>
                    </motion.div>
                ) : (
                    <motion.div
                        variants={containerVariants}
                        initial="hidden"
                        animate="visible"
                        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10"
                    >
                        {curriculums.map((curr) => (
                            <CurriculumCard key={curr.id} curr={curr} navigate={navigate} variants={itemVariants} />
                        ))}
                    </motion.div>
                )}
            </div>

            {/* Premium Create Modal */}
            <CreateModal
                isOpen={isCreating}
                onClose={() => setIsCreating(false)}
                step={creatingStep}
                errorMessage={errorMessage}
                onSubmit={handleCreate}
                newGoal={newGoal}
                setNewGoal={setNewGoal}
                selectedDoc={selectedDoc}
                setSelectedDoc={setSelectedDoc}
                documents={documents}
            />
        </div>
    );

};

// Sub-component for individual card to keep main clean
const CurriculumCard = ({ curr, navigate, variants }) => {
    const progress = Math.round((curr.modules?.filter(m => m.is_completed).length / (curr.modules?.length || 1)) * 100);

    return (
        <motion.div
            variants={variants}
            whileHover={{ y: -10, scale: 1.02 }}
            onClick={() => navigate(`/curriculum/${curr.id}`)}
            className="group relative bg-dark-900/40 rounded-[2.5rem] p-10 shadow-2xl border border-white/5 cursor-pointer overflow-hidden transition-all hover:border-primary-500/30 hover:shadow-primary-500/10"
        >
            {/* Ambient Card Background */}
            <div
                className="absolute top-0 right-0 w-64 h-64 opacity-10 rounded-bl-full transition-all group-hover:scale-150 group-hover:opacity-20 duration-1000 blur-3xl pointer-events-none"
                style={{ backgroundColor: curr.theme_color || '#8b5cf6' }}
            />

            <div className="relative z-10 flex flex-col h-full">
                <div className="flex justify-between items-start mb-8">
                    <motion.span
                        animate={{ rotate: [0, 10, -10, 0] }}
                        transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                        className="text-6xl grayscale group-hover:grayscale-0 transition-all duration-500"
                    >
                        {curr.icon}
                    </motion.span>
                    <div className="flex flex-col items-end gap-1">
                        <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest border ${progress === 100
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-primary-500/10 text-primary-400 border-primary-500/20'
                            }`}>
                            {progress === 100 ? 'Mastered' : 'Synapsing'}
                        </span>
                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">
                            {curr.modules?.length || 0} Modules
                        </span>
                    </div>
                </div>

                <h3 className="text-3xl font-black mb-4 text-white group-hover:text-primary-400 transition-colors leading-[1.1] tracking-tight">
                    {curr.title}
                </h3>

                <p className="text-slate-400 text-sm line-clamp-2 mb-10 leading-relaxed font-medium">
                    {curr.description || "Synthesizing specialized knowledge for cognitive acceleration."}
                </p>

                <div className="mt-auto pt-6 border-t border-white/5">
                    <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-tighter text-slate-500 mb-3">
                        <span>Path Mastery</span>
                        <span className="text-white">{progress}%</span>
                    </div>

                    <div className="w-full bg-dark-800 h-1.5 rounded-full overflow-hidden">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ duration: 1.5, ease: "circOut" }}
                            className="h-full rounded-full shadow-[0_0_15px_rgba(139,92,246,0.5)]"
                            style={{
                                backgroundColor: curr.theme_color || '#8b5cf6'
                            }}
                        />
                    </div>
                </div>
            </div>
        </motion.div>
    );
};


// Sub-component for Modal
const CreateModal = ({ isOpen, onClose, step, errorMessage, onSubmit, newGoal, setNewGoal, selectedDoc, setSelectedDoc, documents }) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-dark-950/80 backdrop-blur-xl z-50 flex items-center justify-center p-4"
                    onClick={() => step !== 'generating' && onClose()}
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0, y: 40 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 40 }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-dark-900 border border-white/10 rounded-[3rem] w-full max-w-xl shadow-[0_0_100px_rgba(0,0,0,1)] relative overflow-hidden"
                    >
                        {/* Modal Ambient Light */}
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary-500 to-transparent" />
                        <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary-600/20 rounded-full blur-3xl" />

                        <div className="p-10 relative z-10">
                            {step === 'generating' ? (
                                <div className="text-center py-16">
                                    <div className="relative w-32 h-32 mx-auto mb-10">
                                        <div className="absolute inset-0 border-4 border-white/5 rounded-full" />
                                        <div className="absolute inset-0 border-4 border-primary-500 rounded-full border-t-transparent animate-spin" />
                                        <div className="absolute inset-0 flex items-center justify-center text-5xl">🔭</div>
                                    </div>
                                    <h3 className="text-3xl font-black mb-4 text-white tracking-tight">Orchestrating Knowledge...</h3>
                                    <p className="text-slate-400 text-lg uppercase tracking-[0.2em] text-[12px] font-bold">Recursive AI Decomposition for "{newGoal}"</p>
                                </div>
                            ) : step === 'error' ? (
                                <div className="text-center py-10">
                                    <div className="w-20 h-20 bg-red-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-red-500/20">
                                        <AlertCircle className="w-10 h-10 text-red-400" />
                                    </div>
                                    <h3 className="text-2xl font-black text-white mb-4 tracking-tight">System Interrupt</h3>
                                    <p className="text-red-400 mb-10 bg-red-950/30 p-6 rounded-2xl text-sm border border-red-500/10 font-medium">{errorMessage}</p>
                                    <button
                                        onClick={onClose}
                                        className="w-full py-5 rounded-2xl bg-white/5 font-black text-slate-300 hover:bg-white/10 transition-all uppercase tracking-widest text-xs"
                                    >
                                        Return to Nexus
                                    </button>
                                </div>
                            ) : step === 'done' ? (
                                <div className="text-center py-16">
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        className="w-24 h-24 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-8 border border-emerald-500/30 text-emerald-400 text-5xl"
                                    >
                                        ✓
                                    </motion.div>
                                    <h3 className="text-3xl font-black text-white tracking-tight">Synapse Initialized</h3>
                                </div>
                            ) : (
                                <>
                                    <div className="mb-10 text-center">
                                        <div className="w-16 h-16 bg-primary-500/10 rounded-2xl flex items-center justify-center text-primary-400 mb-6 mx-auto border border-primary-500/20 shadow-lg shadow-primary-500/5">
                                            <BrainCircuit className="w-8 h-8" />
                                        </div>
                                        <h2 className="text-4xl font-black text-white tracking-tighter mb-2">Cognitive Blueprint</h2>
                                        <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Define the parameters of your learning expansion</p>
                                    </div>

                                    <form onSubmit={onSubmit} className="space-y-8">
                                        <div className="space-y-6">
                                            <div className="space-y-3">
                                                <label className="block text-[10px] font-black text-primary-400 uppercase tracking-[0.3em] ml-1">Learning Objective</label>
                                                <input
                                                    type="text"
                                                    value={newGoal}
                                                    onChange={(e) => setNewGoal(e.target.value)}
                                                    placeholder="Quantum Mechanics, Bio-hacking, French Literature..."
                                                    className="w-full px-8 py-5 rounded-3xl bg-dark-950 border border-white/5 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 outline-none transition-all text-xl font-bold placeholder:text-slate-700 shadow-inner"
                                                    autoFocus
                                                    required
                                                />
                                            </div>

                                            <div className="space-y-3">
                                                <label className="block text-[10px] font-black text-primary-400 uppercase tracking-[0.3em] ml-1">Contextual Source (Recommended)</label>
                                                <div className="relative">
                                                    <select
                                                        value={selectedDoc}
                                                        onChange={(e) => setSelectedDoc(e.target.value)}
                                                        className="w-full px-8 py-5 rounded-3xl bg-dark-950 border border-white/5 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 outline-none transition-all appearance-none text-slate-300 font-bold text-lg cursor-pointer"
                                                    >
                                                        <option value="">Cold Start (Global AI Context)</option>
                                                        {documents.map(doc => (
                                                            <option key={doc.id} value={doc.id}>DATA-NODE: {doc.title}</option>
                                                        ))}
                                                    </select>
                                                    <div className="absolute right-8 top-1/2 -translate-y-1/2 pointer-events-none text-primary-500">
                                                        <ChevronRight className="w-6 h-6 rotate-90" />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex gap-4 pt-4">
                                            <button
                                                type="button"
                                                onClick={onClose}
                                                className="flex-1 px-8 py-5 rounded-3xl bg-white/5 border border-white/5 font-black text-slate-400 hover:bg-white/10 hover:text-white transition-all uppercase tracking-widest text-xs"
                                            >
                                                Abort
                                            </button>
                                            <button
                                                type="submit"
                                                disabled={!newGoal}
                                                className="flex-[2] px-8 py-5 rounded-3xl bg-primary-500 text-white font-black shadow-2xl shadow-primary-500/20 hover:bg-primary-400 hover:shadow-primary-500/40 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-3 uppercase tracking-widest text-xs"
                                            >
                                                Deploy Path <ArrowRight className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </form>
                                </>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};


export default CurriculumList;
