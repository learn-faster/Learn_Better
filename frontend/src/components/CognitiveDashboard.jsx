import React, { useState, useEffect } from 'react';
import { Settings } from 'lucide-react';
import cognitiveService from '../services/cognitive';
import CognitiveSettingsModal from './CognitiveSettingsModal';

const CognitiveDashboard = () => {
    const [recommendation, setRecommendation] = useState(null);
    const [gaps, setGaps] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showSettings, setShowSettings] = useState(false);

    const fetchData = React.useCallback(async () => {
        try {
            const rec = await cognitiveService.getRecommendation();
            setRecommendation(rec);
            const gapList = await cognitiveService.getGaps();
            setGaps(gapList);
        } catch (error) {
            console.error("Failed to fetch cognitive data", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();

        const handleGapUpdate = () => fetchData();
        window.addEventListener('gap-logged', handleGapUpdate);
        return () => window.removeEventListener('gap-logged', handleGapUpdate);
    }, [fetchData]);

    const handleResolveGap = async (id) => {
        try {
            await cognitiveService.resolveGap(id);
            setGaps(gaps.filter(g => g.id !== id));
        } catch (error) {
            console.error("Failed to resolve gap", error);
        }
    };

    if (loading) return <div className="p-4 text-center">Loading Cognitive Insights...</div>;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 relative">
            <CognitiveSettingsModal
                isOpen={showSettings}
                onClose={() => setShowSettings(false)}
                onUpdate={fetchData}
            />

            {/* Refined Bio-Rhythm / Focus Phase Card */}
            <div className="bg-dark-900 border border-white/5 rounded-3xl p-8 relative overflow-hidden group shadow-2xl">
                {/* Subtle Grid Background */}
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20" />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/80" />

                <div className="relative z-10 flex flex-col h-full justify-between">
                    <div>
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                                    <span className="text-xl">🧠</span>
                                </div>
                                <div>
                                    <h2 className="text-sm font-bold text-white uppercase tracking-widest">Cognitive State</h2>
                                    <p className="text-xs text-dark-400 font-medium">Real-time analysis</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowSettings(true)}
                                className="p-2 hover:bg-white/5 rounded-xl text-dark-400 hover:text-white transition-colors border border-transparent hover:border-white/5"
                            >
                                <Settings className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="mb-8">
                            <h3 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-2">
                                {recommendation?.current_phase?.name || "Calibrating..."}
                            </h3>
                            <div className="flex flex-wrap items-center gap-3">
                                <span className="px-3 py-1 rounded-full bg-indigo-500 text-white text-xs font-bold uppercase tracking-wider shadow-lg shadow-indigo-500/20">
                                    {recommendation?.current_phase?.type || "Analysis"} Phase
                                </span>
                                <span className="text-dark-400 font-mono text-sm font-medium">
                                    {recommendation?.current_phase?.start_time} — {recommendation?.current_phase?.end_time}
                                </span>
                            </div>
                        </div>

                        <div className="bg-white/5 border border-white/5 rounded-2xl p-6 backdrop-blur-sm">
                            <div className="flex items-start gap-4">
                                <div className="mt-1">
                                    <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse shadow-[0_0_10px_rgba(74,222,128,0.5)]" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-bold text-indigo-200 uppercase tracking-widest mb-1">Recommended Strategy</h4>
                                    <p className="text-lg text-white font-medium leading-relaxed">
                                        {recommendation?.current_phase?.action}
                                    </p>
                                    <p className="text-sm text-dark-400 mt-2 font-medium">
                                        {recommendation?.current_phase?.reason}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between">
                        <div>
                            <span className="block text-[10px] font-bold text-dark-500 uppercase tracking-widest mb-1">Up Next</span>
                            <span className="text-white font-bold">{recommendation?.next_phase?.name}</span>
                        </div>
                        <div className="text-right">
                            <span className="block text-[10px] font-bold text-dark-500 uppercase tracking-widest mb-1">Starts At</span>
                            <span className="font-mono text-indigo-300">{recommendation?.next_phase?.start_time}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Gap Journal - Notebook Style */}
            <div className="bg-[#f0f0f0] text-gray-800 rounded-3xl p-1 shadow-2xl rotate-1 hover:rotate-0 transition-transform duration-500 relative flex flex-col min-h-[400px]">
                {/* Notebook Binding */}
                <div className="absolute left-4 top-0 bottom-0 w-8 border-r-2 border-dashed border-gray-300 z-10 hidden sm:block"></div>

                <div className="h-full bg-white rounded-[20px] p-6 sm:pl-16 shadow-inner relative overflow-hidden flex flex-col">
                    {/* Paper Lines Background */}
                    <div className="absolute inset-0"
                        style={{
                            backgroundImage: 'linear-gradient(#e5e7eb 1px, transparent 1px)',
                            backgroundSize: '100% 2rem',
                            marginTop: '3.5rem'
                        }}
                    />

                    <div className="relative z-10 flex justify-between items-end border-b-2 border-red-100 pb-2 mb-2">
                        <div>
                            <h2 className="text-2xl font-serif font-bold text-gray-900 italic tracking-tight">Gap Journal</h2>
                            <p className="text-xs text-gray-500 font-mono">Date: {new Date().toLocaleDateString()}</p>
                        </div>
                        <div className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rotate-3 font-bold shadow-sm border border-yellow-200 handwritten">
                            {gaps.length} Gaps Found
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 relative z-10">
                        {gaps.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-48 space-y-4 opacity-50">
                                <span className="text-4xl">✍️</span>
                                <p className="font-handwritten text-xl text-gray-400 rotate-[-2deg]">Page is empty...</p>
                                <p className="text-sm text-gray-400">Great understanding so far!</p>
                            </div>
                        ) : (
                            <ul className="space-y-0 text-sm font-medium pt-1">
                                {gaps.map((gap) => (
                                    <li key={gap.id} className="group flex items-start justify-between min-h-[2rem] py-1 hover:bg-yellow-50/50 transition-colors">
                                        <div className="flex gap-3 pt-1">
                                            <span className="text-red-400 mt-1">•</span>
                                            <p className="text-gray-700 font-serif leading-8 italic">{gap.description}</p>
                                        </div>
                                        <button
                                            onClick={() => handleResolveGap(gap.id)}
                                            className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold text-blue-600 underline decoration-wavy hover:text-blue-800 mt-2 mr-2"
                                        >
                                            RESOLVED
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>

                {/* Notebook Cover Edge Effect */}
                <div className="absolute inset-y-0 right-0 w-2 bg-gradient-to-l from-gray-300/20 to-transparent pointer-events-none rounded-r-3xl" />
            </div>
        </div>
    );
};

export default CognitiveDashboard;
