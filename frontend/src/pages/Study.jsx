import React, { useEffect, useState } from 'react';
import {
    Play,
    Settings,
    RotateCcw,
    ChevronRight,
    Timer,
    Trophy,
    ArrowRight,
    Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useFlashcardStore from '../stores/useFlashcardStore';
import useStudyStore from '../stores/useStudyStore';
import StudyCard from '../components/study/StudyCard';
import Card from '../components/ui/Card';
import StudyTimer from '../components/ui/Timer';

/**
 * Study Session Page Component.
 * 
 * Manages the active recall / SRS study flow.
 * Workflow:
 * 1. Shows a session setup screen with due card counts.
 * 2. Starts a study session on the backend.
 * 3. Iterates through due cards using the `StudyCard` component.
 * 4. Captures user recall ratings (0-5) for each card.
 * 5. Syncs results to the backend SRS engine.
 * 6. Displays a session completion summary with stats.
 * 
 * @returns {JSX.Element} The rendered study page.
 */
const Study = () => {
    const { dueCards, fetchDueCards } = useFlashcardStore();
    const { currentSession, startSession, submitReview, endSession } = useStudyStore();

    const [currentIndex, setCurrentIndex] = useState(0);
    const [sessionResults, setSessionResults] = useState(null);
    const [startTime, setStartTime] = useState(null);

    useEffect(() => {
        fetchDueCards();
    }, [fetchDueCards]);

    const handleStart = async () => {
        await startSession();
        setCurrentIndex(0);
        setSessionResults(null);
        setStartTime(Date.now());
    };

    const handleRate = async (rating) => {
        const card = dueCards[currentIndex];
        const timeTaken = Math.round((Date.now() - startTime) / 1000);

        await submitReview({
            flashcard_id: card.id,
            rating,
            time_taken: timeTaken
        });

        if (currentIndex < dueCards.length - 1) {
            setCurrentIndex(prev => prev + 1);
            setStartTime(Date.now());
        } else {
            const stats = await endSession();
            setSessionResults(stats);
        }
    };

    const currentProgress = ((currentIndex) / (dueCards.length)) * 100;

    if (sessionResults) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[70vh] text-center max-w-2xl mx-auto animate-scale-in">
                <div className="w-24 h-24 rounded-full bg-emerald-500/20 flex items-center justify-center mb-8 border border-emerald-500/30">
                    <Trophy className="w-12 h-12 text-emerald-400" />
                </div>
                <h1 className="text-4xl font-extrabold mb-4 tracking-tight">Session Complete!</h1>
                <p className="text-dark-400 text-lg mb-12">Great work! You've successfully retrieved concepts from your long-term memory.</p>

                <div className="grid grid-cols-2 gap-6 w-full mb-12">
                    <Card className="py-8">
                        <p className="text-xs font-bold text-dark-500 uppercase mb-2">Cards Reviewed</p>
                        <h3 className="text-3xl font-bold">{sessionResults.cards_reviewed}</h3>
                    </Card>
                    <Card className="py-8">
                        <p className="text-xs font-bold text-dark-500 uppercase mb-2">Average Recall</p>
                        <h3 className="text-3xl font-bold">{sessionResults.average_rating?.toFixed(1)} / 5</h3>
                    </Card>
                </div>

                <button onClick={() => window.location.reload()} className="btn-primary px-8 py-4 text-lg">
                    Back to Dashboard
                    <ArrowRight className="w-6 h-6" />
                </button>
            </div>
        );
    }

    if (!currentSession) {
        return (
            <div className="max-w-3xl mx-auto space-y-8 animate-fade-in">

                <Card className="bg-gradient-to-br from-primary-600/10 to-transparent">
                    <div className="flex flex-col md:flex-row items-center gap-8 p-4">
                        <div className="w-32 h-32 rounded-3xl bg-primary-500/20 flex items-center justify-center border border-primary-500/20">
                            <Sparkles className="w-16 h-16 text-primary-400" />
                        </div>
                        <div className="flex-1 text-center md:text-left">
                            <h3 className="text-2xl font-bold mb-2">Daily Review</h3>
                            <p className="text-dark-400 leading-relaxed mb-6">
                                You have <span className="text-white font-bold">{dueCards.length} cards</span> due for review today based on your spaced repetition schedule.
                            </p>
                            <button
                                disabled={dueCards.length === 0}
                                onClick={handleStart}
                                className="btn-primary py-3 px-8 text-lg w-full md:w-auto"
                            >
                                <Play className="w-5 h-5 fill-current" />
                                Start Study Session
                            </button>
                        </div>
                    </div>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card title="Session Options" icon={Settings}>
                        <div className="space-y-4 pt-2">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">SRS Algorithm</span>
                                <span className="text-xs bg-white/5 px-2 py-1 rounded border border-white/5 uppercase font-bold">SM-2 Optimized</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">Time Limit</span>
                                <span className="text-xs text-dark-500">None</span>
                            </div>
                        </div>
                    </Card>

                    <Card title="Quick Tips" icon={Timer}>
                        <ul className="text-sm text-dark-400 space-y-2 pt-2">
                            <li className="flex items-start gap-2">• Be honest with your ratings</li>
                            <li className="flex items-start gap-2">• Try to self-explain the answer</li>
                            <li className="flex items-start gap-2">• Don't rush; focus on retrieval</li>
                        </ul>
                    </Card>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto flex flex-col h-[calc(100vh-12rem)]">
            {/* Session Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-primary-500/10 flex items-center justify-center text-primary-400 font-bold border border-primary-500/20">
                        {currentIndex + 1}
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">Card Retrieval</p>
                        <h2 className="font-bold text-white uppercase tracking-tight">Active Progress</h2>
                    </div>
                </div>
                <div className="flex items-center gap-6">
                    <div className="hidden md:block">
                        <StudyTimer initialDuration={25 * 60} />
                    </div>
                    <div className="hidden md:flex flex-col items-end">
                        <span className="text-[10px] font-bold text-dark-500 uppercase tracking-widest text-right mb-1">Due Cards</span>
                        <div className="flex gap-1">
                            {dueCards.slice(0, 10).map((_, i) => (
                                <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < currentIndex ? 'bg-primary-500' : 'bg-white/10'}`} />
                            ))}
                            {dueCards.length > 10 && <span className="text-[10px] text-dark-600">...</span>}
                        </div>
                    </div>
                    <button
                        onClick={() => window.location.reload()}
                        className="p-2 hover:bg-white/5 rounded-lg text-dark-500 hover:text-white transition-colors"
                    >
                        <RotateCcw className="w-6 h-6" />
                    </button>
                </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden mb-12">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${currentProgress}%` }}
                    className="h-full bg-gradient-to-r from-primary-600 to-primary-400"
                />
            </div>

            {/* Card Content */}
            <div className="flex-1 flex items-center animate-fade-in">
                <StudyCard
                    key={currentIndex}
                    card={dueCards[currentIndex]}
                    onRate={handleRate}
                />
            </div>
        </div>
    );
};

export default Study;
