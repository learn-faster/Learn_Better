import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, BrainCircuit, Lightbulb, Loader2 } from 'lucide-react';
import useStudyStore from '../../stores/useStudyStore';

/**
 * Interactive Study Card Component.
 * 
 * Provides a 3D flip animation and rating system for active recall sessions.
 * Users view the front, flip to reveal the back, and then rate their recall (0-5).
 * Uses Framer Motion for premium fluid animations.
 * 
 * @param {Object} props - Component properties.
 * @param {Object} props.card - The flashcard data object.
 * @param {Function} props.onRate - Callback function taking the user's rating.
 * @returns {JSX.Element} The rendered study card.
 */
const StudyCard = ({ card, onRate }) => {
    const [isFlipped, setIsFlipped] = useState(false);
    const [hint, setHint] = useState(null);
    const [loadingHint, setLoadingHint] = useState(false);
    const { getHint } = useStudyStore();

    const handleGetHint = async (e) => {
        e.stopPropagation();
        if (hint || loadingHint) return;

        setLoadingHint(true);
        try {
            const hintText = await getHint(card.id);
            setHint(hintText);
        } catch (error) {
            console.error("Hint failed", error);
        } finally {
            setLoadingHint(false);
        }
    };

    const ratings = [
        { value: 0, label: '0', color: 'hover:bg-red-500 hover:text-white border-red-500/30' },
        { value: 1, label: '1', color: 'hover:bg-orange-600 hover:text-white border-orange-600/30' },
        { value: 2, label: '2', color: 'hover:bg-orange-400 hover:text-white border-orange-400/30' },
        { value: 3, label: '3', color: 'hover:bg-blue-400 hover:text-white border-blue-400/30' },
        { value: 4, label: '4', color: 'hover:bg-emerald-400 hover:text-white border-emerald-400/30' },
        { value: 5, label: '5', color: 'hover:bg-emerald-600 hover:text-white border-emerald-600/30' },
    ];

    return (
        <div className="w-full max-w-2xl mx-auto perspective-[1500px]">
            <motion.div
                className="relative w-full aspect-[4/3] transition-all duration-700 cursor-pointer"
                style={{ transformStyle: 'preserve-3d' }}
                animate={{ rotateY: isFlipped ? 180 : 0 }}
                onClick={() => setIsFlipped(!isFlipped)}
            >
                {/* Front Side */}
                <div
                    className="absolute inset-0 rounded-3xl p-1 px-1 bg-dark-800/90"
                    style={{ backfaceVisibility: 'hidden' }}
                >
                    <div className="w-full h-full glass-morphism rounded-[2.5rem] p-12 flex flex-col items-center justify-center text-center shadow-2xl border border-white/10 group">
                        <div className="absolute top-8 left-8 flex items-center gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
                            <BrainCircuit className="w-5 h-5 text-primary-400" />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Question</span>
                        </div>
                        <h2 className="text-3xl md:text-4xl font-bold leading-tight tracking-tight text-white mb-6">
                            {card.front}
                        </h2>

                        <AnimatePresence>
                            {hint && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl relative overflow-hidden group/hint"
                                >
                                    <div className="flex items-start gap-3 text-left">
                                        <Lightbulb className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                                        <p className="text-sm text-amber-100/90 font-medium leading-relaxed italic">
                                            "{hint}"
                                        </p>
                                    </div>
                                    <div className="absolute top-0 right-0 p-1 px-2 bg-amber-500 text-[8px] font-black text-black rounded-bl-lg uppercase tracking-widest">
                                        Socratic Hint
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div className="flex flex-col items-center gap-4">
                            {!isFlipped && (
                                <button
                                    onClick={handleGetHint}
                                    disabled={loadingHint || hint}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all border font-bold text-xs uppercase tracking-widest z-10 ${hint
                                            ? 'bg-amber-500/10 border-amber-500/20 text-amber-500/60 cursor-default'
                                            : 'bg-white/5 border-white/10 text-dark-400 hover:bg-amber-500/10 hover:border-amber-500/30 hover:text-amber-400'
                                        }`}
                                >
                                    {loadingHint ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Lightbulb className="w-4 h-4" />
                                    )}
                                    {hint ? 'Hint Revealed' : 'Get Hint'}
                                </button>
                            )}
                            <p className="text-dark-400 text-sm font-medium animate-pulse">Click to reveal answer</p>
                        </div>

                        {card.tags?.length > 0 && (
                            <div className="absolute bottom-10 flex flex-wrap justify-center gap-2">
                                {card.tags.map(tag => (
                                    <span key={tag} className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[10px] font-bold text-dark-400 uppercase tracking-widest">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Back Side */}
                <div
                    className="absolute inset-0 rounded-3xl p-1 px-1 bg-dark-900/95"
                    style={{
                        backfaceVisibility: 'hidden',
                        transform: 'rotateY(180deg)'
                    }}
                >
                    <div className="w-full h-full glass-morphism rounded-[2.5rem] p-12 flex flex-col items-center justify-center text-center shadow-2xl border border-primary-500/20 relative">
                        <div className="absolute top-8 left-8 flex items-center gap-2 opacity-50">
                            <Sparkles className="w-5 h-5 text-emerald-400" />
                            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Answer</span>
                        </div>
                        <div className="flex-1 flex flex-col justify-center">
                            <h2 className="text-2xl md:text-3xl font-medium leading-relaxed tracking-tight text-white/90">
                                {card.back}
                            </h2>
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Rating Controls */}
            <AnimatePresence>
                {isFlipped && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="mt-12 flex flex-col items-center gap-6"
                    >
                        <p className="text-sm font-bold text-dark-400 uppercase tracking-[0.2em]">Rate your recall difficulty</p>
                        <div className="flex gap-3 justify-center">
                            {ratings.map((rating) => (
                                <button
                                    key={rating.value}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onRate(rating.value);
                                        setIsFlipped(false);
                                    }}
                                    className={`w-14 h-14 md:w-16 md:h-16 rounded-2xl flex items-center justify-center text-xl font-bold border-2 transition-all active:scale-90 ${rating.color} glass`}
                                >
                                    {rating.label}
                                </button>
                            ))}
                        </div>
                        <div className="flex justify-between w-full max-w-xs text-[10px] font-bold text-dark-600 uppercase tracking-widest mt-1">
                            <span>Forgot</span>
                            <span>Perfect</span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default StudyCard;
