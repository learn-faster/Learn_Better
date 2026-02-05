
import React from 'react';
import { motion } from 'framer-motion';

const FocusAura = ({ focusData }) => {
    const score = focusData?.score || 50;

    // Color mapping based on focus score
    const getAuraColor = (s) => {
        if (s >= 80) return 'from-cyan-400 to-blue-600'; // High Flow
        if (s >= 60) return 'from-indigo-400 to-purple-600'; // Work
        if (s >= 40) return 'from-amber-400 to-orange-600'; // Dip
        return 'from-slate-600 to-slate-900'; // Rest
    };

    return (
        <div className="relative flex items-center justify-center w-full h-[300px]">
            {/* Animated Background Aura */}
            <motion.div
                animate={{
                    scale: [1, 1.2, 1],
                    opacity: [0.3, 0.6, 0.3],
                }}
                transition={{
                    duration: 4,
                    repeat: Infinity,
                    ease: "easeInOut"
                }}
                className={`absolute w-32 h-32 rounded-full blur-3xl bg-gradient-to-r ${getAuraColor(score)}`}
            />

            {/* Core Orb */}
            <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                whileHover={{ scale: 1.05 }}
                className={`relative z-10 w-40 h-40 rounded-full bg-gradient-to-br ${getAuraColor(score)} p-1 shadow-2xl shadow-primary-500/20`}
            >
                <div className="w-full h-full rounded-full bg-dark-900/80 backdrop-blur-xl flex flex-col items-center justify-center border border-white/10">
                    <span className="text-4xl mb-1">
                        {score >= 80 ? '⚡' : score >= 60 ? '🧠' : score >= 40 ? '☕' : '😴'}
                    </span>
                    <span className="text-sm font-black text-white uppercase tracking-widest">{focusData?.type || 'Rest'}</span>
                    <div className="h-1 w-12 bg-white/10 rounded-full mt-2 overflow-hidden">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${score}%` }}
                            className="h-full bg-primary-400"
                        />
                    </div>
                </div>
            </motion.div>

            <div className="absolute bottom-[-20px] left-0 right-0 text-center px-4">
                <p className="text-[10px] text-dark-400 max-w-[200px] mx-auto leading-relaxed border-t border-white/5 pt-2 italic">
                    {focusData?.reason}
                </p>
            </div>

            {/* Orbital Rings */}
            <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                className="absolute w-56 h-56 border border-dashed border-white/5 rounded-full"
            />
            <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                className="absolute w-64 h-64 border border-white/5 rounded-full"
            />
        </div>
    );
};

export default FocusAura;
