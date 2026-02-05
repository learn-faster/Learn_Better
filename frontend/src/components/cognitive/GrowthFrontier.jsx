
import React from 'react';
import { motion } from 'framer-motion';
import { Compass, ArrowRight, Zap } from 'lucide-react';

const GrowthFrontier = ({ concepts, onStartLesson }) => {
    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 mb-6 text-dark-400">
                <Compass className="w-4 h-4 text-primary-400" />
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em]">Next Growth Frontiers</h3>
            </div>

            {(!concepts || concepts.length === 0) ? (
                <div className="p-8 border-2 border-dashed border-white/5 rounded-3xl text-center">
                    <p className="text-dark-500 text-sm">Upload more documents to expand your graph.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-3">
                    {concepts.map((concept, i) => (
                        <motion.div
                            key={concept.name}
                            initial={{ x: -20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            transition={{ delay: i * 0.1 }}
                            className="group relative bg-white/5 border border-white/5 hover:border-primary-500/30 p-4 rounded-2xl flex items-center justify-between transition-all hover:bg-white/[0.07]"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-primary-500/10 flex items-center justify-center text-primary-400">
                                    <Zap className="w-5 h-5 fill-current opacity-50" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-bold text-white capitalize">{concept.name}</h4>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-[10px] text-primary-400 font-black uppercase tracking-[0.2em]">Neural Path Unlocked</span>
                                        <span className="text-[10px] text-dark-500">•</span>
                                        <span className="text-[10px] text-dark-400 font-bold">{concept.relevance}% Match</span>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={() => onStartLesson?.(concept.name)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-2 bg-primary-500 rounded-lg text-white shadow-lg shadow-primary-500/20"
                            >
                                <ArrowRight className="w-4 h-4" />
                            </button>
                        </motion.div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default GrowthFrontier;
