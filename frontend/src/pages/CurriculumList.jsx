import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Plus, BookOpen, Clock, ChevronRight, GraduationCap, ArrowRight, Sparkles, AlertCircle } from 'lucide-react';
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
        <div className="min-h-screen bg-gray-50 font-sans text-gray-900 relative overflow-hidden">
            {/* Ambient Background */}
            <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-blue-50 to-transparent pointer-events-none" />
            <div className="absolute top-[-100px] right-[-100px] w-[500px] h-[500px] bg-purple-100 rounded-full blur-[100px] opacity-50 pointer-events-none" />
            <div className="absolute top-[200px] left-[-100px] w-[300px] h-[300px] bg-blue-100 rounded-full blur-[80px] opacity-40 pointer-events-none" />

            <div className="max-w-7xl mx-auto px-6 py-12 relative z-10">

                {/* Header */}
                <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-16 gap-6">
                    <div>
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-center gap-2 text-blue-600 font-bold tracking-wider uppercase text-sm mb-2"
                        >
                            <Sparkles className="w-4 h-4" /> AI Powered Learning
                        </motion.div>
                        <motion.h1
                            initial={{ x: -20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            className="text-5xl font-extrabold text-gray-900 tracking-tight mb-4"
                        >
                            Your Curriculum
                        </motion.h1>
                        <motion.p
                            initial={{ x: -20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            transition={{ delay: 0.1 }}
                            className="text-xl text-gray-500 max-w-2xl leading-relaxed"
                        >
                            Generate structured learning paths for any topic, track your progress, and master new skills with AI-guided lessons.
                        </motion.p>
                    </div>
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setIsCreating(true)}
                        className="flex items-center gap-3 bg-gray-900 text-white px-8 py-4 rounded-2xl font-bold shadow-xl hover:shadow-2xl hover:bg-gray-800 transition-all group"
                    >
                        <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform" />
                        Create New Path
                    </motion.button>
                </header>

                {/* Content Grid */}
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-32 space-y-4 text-gray-400">
                        <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-blue-600"></div>
                        <p>Loading your paths...</p>
                    </div>
                ) : curriculums.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-center py-32 bg-white rounded-[2rem] border border-dashed border-gray-300"
                    >
                        <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
                            <GraduationCap className="w-10 h-10 text-gray-400" />
                        </div>
                        <h3 className="text-2xl font-bold text-gray-900 mb-2">No learning paths yet</h3>
                        <p className="text-gray-500 mb-8 max-w-md mx-auto">Start your journey by creating a new curriculum for any topic you want to learn.</p>
                        <button
                            onClick={() => setIsCreating(true)}
                            className="text-blue-600 font-bold hover:underline"
                        >
                            Create your first path &rarr;
                        </button>
                    </motion.div>
                ) : (
                    <motion.div
                        variants={containerVariants}
                        initial="hidden"
                        animate="visible"
                        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
                    >
                        {curriculums.map((curr) => (
                            <CurriculumCard key={curr.id} curr={curr} navigate={navigate} variants={itemVariants} />
                        ))}
                    </motion.div>
                )}
            </div>

            {/* Create Modal */}
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
            whileHover={{ y: -8, scale: 1.02 }}
            onClick={() => navigate(`/curriculum/${curr.id}`)}
            className="group relative bg-white rounded-[2rem] p-8 shadow-sm border border-gray-100 cursor-pointer overflow-hidden transition-all hover:shadow-2xl hover:border-blue-100"
        >
            <div
                className="absolute top-0 right-0 w-48 h-48 opacity-[0.03] rounded-bl-full transition-transform group-hover:scale-125 duration-700 pointer-events-none"
                style={{ backgroundColor: curr.theme_color || '#000' }}
            />

            <div className="relative z-10 flex flex-col h-full">
                <div className="flex justify-between items-start mb-6">
                    <span className="text-5xl filter drop-shadow-sm">{curr.icon}</span>
                    <span
                        className={`text-xs font-bold px-3 py-1 rounded-full uppercase tracking-widest ${progress === 100 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                    >
                        {progress === 100 ? 'Completed' : 'In Progress'}
                    </span>
                </div>

                <h3 className="text-2xl font-bold mb-3 text-gray-900 group-hover:text-blue-600 transition-colors leading-tight">
                    {curr.title}
                </h3>

                <p className="text-gray-500 text-sm line-clamp-2 mb-8 leading-relaxed">
                    {curr.description || "A personalized learning path generated by AI."}
                </p>

                <div className="mt-auto">
                    <div className="flex items-center justify-between text-sm font-semibold text-gray-400 mb-3">
                        <span className="flex items-center gap-2">
                            <BookOpen className="w-4 h-4" /> {curr.modules?.length || 0} Modules
                        </span>
                        <span>{progress}%</span>
                    </div>

                    <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                        <div
                            className="h-full rounded-full transition-all duration-1000 ease-out"
                            style={{
                                width: `${progress}%`,
                                backgroundColor: curr.theme_color || '#3b82f6'
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
                    className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                    onClick={() => step !== 'generating' && onClose()}
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 20 }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-white rounded-[2rem] w-full max-w-lg shadow-2xl relative overflow-hidden"
                    >
                        <div className="p-8">
                            {step === 'generating' ? (
                                <div className="text-center py-12">
                                    <div className="relative w-24 h-24 mx-auto mb-8">
                                        <div className="absolute inset-0 border-4 border-gray-100 rounded-full"></div>
                                        <div className="absolute inset-0 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
                                        <div className="absolute inset-0 flex items-center justify-center text-3xl animate-pulse">🔮</div>
                                    </div>
                                    <h3 className="text-2xl font-bold mb-2 text-gray-900">Designing Curriculum...</h3>
                                    <p className="text-gray-500">AI is researching "{newGoal}" and structuring your lessons.</p>
                                </div>
                            ) : step === 'error' ? (
                                <div className="text-center py-8">
                                    <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <AlertCircle className="w-8 h-8 text-red-500" />
                                    </div>
                                    <h3 className="text-xl font-bold text-gray-900 mb-2">Generation Failed</h3>
                                    <p className="text-red-500 mb-6 bg-red-50 p-4 rounded-xl text-sm">{errorMessage}</p>
                                    <button
                                        onClick={onClose}
                                        className="w-full py-3 rounded-xl bg-gray-100 font-bold text-gray-700 hover:bg-gray-200"
                                    >
                                        Close
                                    </button>
                                </div>
                            ) : step === 'done' ? (
                                <div className="text-center py-12">
                                    <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 text-green-600 text-4xl">
                                        ✓
                                    </div>
                                    <h3 className="text-2xl font-bold text-gray-900">Ready!</h3>
                                </div>
                            ) : (
                                <>
                                    <div className="mb-8">
                                        <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 mb-4 shadow-sm">
                                            <GraduationCap className="w-6 h-6" />
                                        </div>
                                        <h2 className="text-3xl font-bold text-gray-900">New Learning Goal</h2>
                                        <p className="text-gray-500 mt-2">What do you want to master today?</p>
                                    </div>

                                    <form onSubmit={onSubmit}>
                                        <div className="space-y-6">
                                            <div>
                                                <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">Topic or Skill</label>
                                                <input
                                                    type="text"
                                                    value={newGoal}
                                                    onChange={(e) => setNewGoal(e.target.value)}
                                                    placeholder="e.g. Machine Learning, Italian Cooking, Calculus..."
                                                    className="w-full px-5 py-4 rounded-xl border-2 border-gray-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all text-lg font-medium placeholder:font-normal"
                                                    autoFocus
                                                    required
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">Source Material (Optional)</label>
                                                <div className="relative">
                                                    <select
                                                        value={selectedDoc}
                                                        onChange={(e) => setSelectedDoc(e.target.value)}
                                                        className="w-full px-5 py-4 rounded-xl border-2 border-gray-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all bg-white appearance-none text-gray-700 font-medium"
                                                    >
                                                        <option value="">Start from Scratch (AI Research)</option>
                                                        {documents.map(doc => (
                                                            <option key={doc.id} value={doc.id}>📄 {doc.title}</option>
                                                        ))}
                                                    </select>
                                                    <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                                        <ChevronRight className="w-5 h-5 rotate-90" />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex gap-4 mt-10">
                                            <button
                                                type="button"
                                                onClick={onClose}
                                                className="flex-1 px-6 py-4 rounded-xl border-2 border-gray-100 font-bold text-gray-600 hover:bg-gray-50 hover:border-gray-200 transition-all"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="submit"
                                                disabled={!newGoal}
                                                className="flex-[2] px-6 py-4 rounded-xl bg-blue-600 text-white font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 hover:shadow-xl hover:shadow-blue-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                            >
                                                Generate Path <ArrowRight className="w-5 h-5" />
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
