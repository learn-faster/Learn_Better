import React, { useState } from 'react';
import cognitiveService from '../services/cognitive';

/**
 * GapJournal Component.
 * 
 * An interactive tool for "articulating knowledge gaps." 
 * Allows users to record specific points of confusion during study sessions, 
 * which is a critical metacognitive practice.
 * 
 * @returns {JSX.Element} The rendered Gap Journal interface.
 */
const GapJournal = () => {
    const [description, setDescription] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!description.trim()) return;

        setIsSubmitting(true);
        try {
            await cognitiveService.logGap({ description });
            setDescription('');
            // Notify dashboard to refresh gaps list
            window.dispatchEvent(new CustomEvent('gap-logged'));
        } catch (error) {
            console.error(error);
            alert("Failed to log gap.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/20 dark:to-amber-950/10 border border-orange-100 dark:border-orange-900/30 rounded-3xl p-6 transition-all duration-300 hover:shadow-lg hover:shadow-orange-500/5">
            <div className="flex items-center justify-between mb-4">
                <h4 className="text-orange-900 dark:text-orange-200 font-bold flex items-center gap-2 tracking-tight">
                    <span className="p-2 rounded-xl bg-orange-100 dark:bg-orange-800/30 text-lg">💡</span>
                    Gap Journal
                </h4>
                <span className="text-[10px] font-bold uppercase tracking-widest text-orange-400 opacity-50">
                    Active Cognition
                </span>
            </div>
            <form onSubmit={handleSubmit} className="relative">
                <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="I'm stuck on... (e.g. 'Why does the integral of 1/x become ln|x|?')"
                    className="w-full p-4 text-sm bg-white/50 dark:bg-gray-800/50 border-2 border-orange-100 dark:border-orange-900/30 rounded-2xl text-gray-700 dark:text-gray-200 focus:ring-4 focus:ring-orange-500/10 focus:border-orange-400 outline-none transition-all resize-none min-h-[100px]"
                />
                <div className="mt-4 flex items-center justify-between">
                    <p className="text-[10px] text-gray-400 italic">
                        Logs are saved for review later.
                    </p>
                    <button
                        type="submit"
                        disabled={!description || isSubmitting}
                        className="group relative flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold py-2.5 px-6 rounded-xl transition-all shadow-md shadow-orange-500/20 active:scale-95 disabled:opacity-50 disabled:grayscale"
                    >
                        {isSubmitting ? (
                            <span className="flex items-center gap-2">
                                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Logging...
                            </span>
                        ) : (
                            <>
                                Log Insight
                                <span className="opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all">→</span>
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default GapJournal;
