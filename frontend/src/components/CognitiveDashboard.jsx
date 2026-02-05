import React, { useState, useEffect } from 'react';
import { Settings, Info, TrendingUp, AlertCircle, BrainCircuit } from 'lucide-react';
import cognitiveService from '../services/cognitive';
import FocusAura from './cognitive/FocusAura';
import GrowthFrontier from './cognitive/GrowthFrontier';
import StabilityMap from './cognitive/StabilityMap';
import CognitiveSettingsModal from './CognitiveSettingsModal';
import { motion, AnimatePresence } from 'framer-motion';

const CognitiveDashboard = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showSettings, setShowSettings] = useState(false);
    const [activeTab, setActiveTab] = useState('focus'); // 'focus', 'stability', 'frontier'

    const fetchData = React.useCallback(async () => {
        try {
            const overview = await cognitiveService.getOverview();
            setData(overview);
        } catch (error) {
            console.error("Failed to fetch cognitive overview", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 60000); // Refresh every minute for focus state
        return () => clearInterval(interval);
    }, [fetchData]);

    if (loading) return (
        <div className="flex items-center justify-center p-20">
            <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            >
                <BrainCircuit className="w-8 h-8 text-primary-500 opacity-50" />
            </motion.div>
        </div>
    );

    return (
        <div className="relative">
            <CognitiveSettingsModal
                isOpen={showSettings}
                onClose={() => setShowSettings(false)}
                onUpdate={fetchData}
            />

            {/* Header Content */}
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4 px-2">
                <div>
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        Neural Synthesis
                        <span className="text-[10px] bg-primary-500/20 text-primary-400 px-2 py-0.5 rounded-full border border-primary-500/30">Alpha</span>
                    </h3>
                    <p className="text-dark-500 text-xs mt-1">Metacognitive metrics and knowledge growth tracking.</p>
                </div>

                <div className="flex bg-white/5 border border-white/5 p-1 rounded-xl">
                    {['focus', 'stability', 'frontier'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${activeTab === tab ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/20' : 'text-dark-400 hover:text-white'
                                }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Panel: Primary Metric / Visualization */}
                <div className="lg:col-span-2 glass border-white/5 rounded-3xl p-8 relative overflow-hidden">
                    <AnimatePresence mode="wait">
                        {activeTab === 'focus' && (
                            <motion.div
                                key="focus"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="grid md:grid-cols-2 gap-8 items-center"
                            >
                                <FocusAura focusData={data?.focus} />
                                <div>
                                    <h4 className="text-2xl font-black text-white mb-2">{data?.focus?.name}</h4>
                                    <p className="text-dark-300 text-sm leading-relaxed mb-6">
                                        {data?.focus?.reason}
                                    </p>
                                    <div className="bg-white/5 border border-white/5 p-4 rounded-2xl">
                                        <div className="flex items-center gap-3 mb-2">
                                            <TrendingUp className="w-4 h-4 text-primary-400" />
                                            <span className="text-xs font-bold uppercase text-primary-400 tracking-widest">Recommended Strategy</span>
                                        </div>
                                        <p className="text-white font-medium">{data?.focus?.action}</p>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {activeTab === 'stability' && (
                            <motion.div
                                key="stability"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="grid md:grid-cols-2 gap-8 items-center"
                            >
                                <StabilityMap stabilityData={data?.knowledge} />
                                <div>
                                    <h4 className="text-2xl font-black text-white mb-2">Knowledge Stability</h4>
                                    <div className="flex items-center gap-4 mb-6">
                                        <div className="text-4xl font-black text-primary-400">{data?.knowledge?.global_stability}%</div>
                                        <div className="h-1 flex-1 bg-white/5 rounded-full overflow-hidden">
                                            <div className="h-full bg-primary-500" style={{ width: `${data?.knowledge?.global_stability}%` }} />
                                        </div>
                                    </div>
                                    {data?.knowledge?.at_risk_concepts?.length > 0 && (
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2 text-amber-400 text-[10px] font-bold uppercase tracking-widest">
                                                <AlertCircle className="w-3 h-3" /> Potential Decay Soon
                                            </div>
                                            {data?.knowledge?.at_risk_concepts.map(c => (
                                                <div key={c.concept} className="flex justify-between items-center text-xs p-2 bg-white/5 rounded-lg border border-white/5">
                                                    <span className="text-white capitalize">{c.concept}</span>
                                                    <span className="text-amber-400/70 font-mono">{c.stability}%</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}

                        {activeTab === 'frontier' && (
                            <motion.div
                                key="frontier"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                            >
                                <div className="max-w-xl mx-auto">
                                    <h4 className="text-2xl font-black text-white text-center mb-2">Your Growth Frontier</h4>
                                    <p className="text-dark-500 text-sm text-center mb-8">Optimal next steps identified by your current graph mastery.</p>
                                    <GrowthFrontier concepts={data?.frontier} onStartLesson={(name) => window.location.hash = `/practice#${name}`} />
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Right Panel: Insights / Quick Stats */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-gradient-to-br from-primary-600/20 to-indigo-600/20 rounded-3xl p-6 border border-primary-500/20 relative overflow-hidden group">
                        <h4 className="text-sm font-bold text-white mb-1">Knowledge Entropy</h4>
                        <p className="text-xs text-primary-200/50 mb-4">Complexity vs. Stability of your brain.</p>
                        <div className="flex items-end gap-1 h-12">
                            {[40, 60, 45, 70, 50, 80, 55, 65, 40, 50].map((h, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ height: 0 }}
                                    animate={{ height: `${h}%` }}
                                    transition={{ delay: i * 0.05 }}
                                    className="flex-1 bg-primary-400/30 rounded-t-sm"
                                />
                            ))}
                        </div>
                        <BrainCircuit className="absolute top-[-10px] right-[-10px] w-24 h-24 text-white/5 group-hover:text-white/10 transition-colors" />
                    </div>

                    <div className="bg-dark-950/80 border border-primary-500/30 rounded-3xl p-6 shadow-[0_0_50px_rgba(139,92,246,0.1)] relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-3">
                            <BrainCircuit className="w-4 h-4 text-primary-500/20" />
                        </div>
                        <h4 className="text-[10px] font-black text-primary-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                            Metacognitive Synthesis
                        </h4>
                        <div className="space-y-4 relative z-10">
                            <p className="text-sm text-white leading-relaxed font-medium italic">
                                "{data?.report || "Awaiting neural pattern synchronization..."}"
                            </p>
                            <div className="flex items-center gap-2 opacity-30">
                                <div className="h-0.5 flex-1 bg-gradient-to-r from-primary-500 to-transparent" />
                                <span className="text-[8px] font-bold uppercase tracking-widest">Authored by Neural-1</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <button
                onClick={() => setShowSettings(true)}
                className="absolute top-4 right-4 p-2 hover:bg-white/5 rounded-xl text-dark-400 hover:text-white transition-colors"
            >
                <Settings className="w-5 h-5" />
            </button>
        </div>
    );
};

export default CognitiveDashboard;
