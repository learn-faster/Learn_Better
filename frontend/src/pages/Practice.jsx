import React, { useState, useEffect } from 'react';
import {
    Library,
    GraduationCap,
    Plus,
    Search,
    BrainCircuit,
    Sparkles,
    Play,
    Settings,
    Timer,
    Clock,
    ChevronRight,
    Search as SearchIcon
} from 'lucide-react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import useFlashcardStore from '../stores/useFlashcardStore';
import useStudyStore from '../stores/useStudyStore';
import Flashcards from './Flashcards';
import Study from './Study';
import Card from '../components/ui/Card';

/**
 * Combined Practice Hub.
 * 
 * Consolidates Flashcard Library and Active Recall Study into a single immersive view.
 */
const Practice = () => {
    const [activeTab, setActiveTab] = useState('review'); // 'review' | 'library'
    const { dueCards, fetchDueCards, flashcards, fetchFlashcards } = useFlashcardStore();

    useEffect(() => {
        fetchDueCards();
        fetchFlashcards();
    }, [fetchDueCards, fetchFlashcards]);

    const tabs = [
        { id: 'review', label: 'Daily Review', icon: GraduationCap, count: dueCards.length },
        { id: 'library', label: 'Library', icon: Library, count: flashcards.length }
    ];

    return (
        <div className="space-y-8 animate-fade-in pb-20">
            {/* Header with Tab Toggles */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
                        Practice Hub
                    </h1>
                    <p className="text-dark-400 mt-2 font-medium">
                        {activeTab === 'review'
                            ? "Master your knowledge through active recall."
                            : "Organize and explore your knowledge base."}
                    </p>
                </div>

                <div className="flex p-1.5 bg-dark-900/50 backdrop-blur-xl border border-white/5 rounded-2xl w-fit">
                    <LayoutGroup>
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`relative flex items-center gap-3 px-6 py-2.5 rounded-xl transition-all font-bold text-sm ${activeTab === tab.id ? 'text-white' : 'text-dark-400 hover:text-dark-200'
                                    }`}
                            >
                                {activeTab === tab.id && (
                                    <motion.div
                                        layoutId="active-tab"
                                        className="absolute inset-0 bg-primary-500/10 border border-primary-500/20 rounded-xl shadow-lg shadow-primary-500/5"
                                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                    />
                                )}
                                <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-primary-400' : 'text-dark-500'}`} />
                                <span>{tab.label}</span>
                                {tab.count > 0 && (
                                    <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-md ${activeTab === tab.id ? 'bg-primary-500 text-white' : 'bg-white/5 text-dark-500'
                                        }`}>
                                        {tab.count}
                                    </span>
                                )}
                            </button>
                        ))}
                    </LayoutGroup>
                </div>
            </div>

            {/* Main Content Area */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 10, filter: 'blur(10px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, y: -10, filter: 'blur(10px)' }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                >
                    {activeTab === 'review' ? (
                        <Study />
                    ) : (
                        <Flashcards />
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
    );
};

export default Practice;
