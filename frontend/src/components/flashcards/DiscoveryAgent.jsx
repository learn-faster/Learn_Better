import React, { useState, useEffect } from 'react';
import { BrainCircuit, Loader2, ChevronRight, CheckCircle2, Sparkles } from 'lucide-react';
import api from '../../services/api';

const DiscoveryAgent = ({ documentId, onProfileGenerated }) => {
    const [step, setStep] = useState('loading'); // loading, questions, synthesizing, complete
    const [onboardingData, setOnboardingData] = useState(null);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [answers, setAnswers] = useState({});
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchQuestions = async () => {
            try {
                setStep('loading');
                const data = await api.get(`/ai/onboarding/${documentId}`);
                setOnboardingData(data);
                setStep('questions');
            } catch (err) {
                console.error('Failed to fetch discovery questions:', err);
                setError('Failed to initialize the Discovery Agent. Using default settings.');
                // Fallback: Skip discovery
                onProfileGenerated('General study focus');
            }
        };

        if (documentId) {
            fetchQuestions();
        }
    }, [documentId]);

    const handleAnswer = (questionId, option) => {
        const newAnswers = { ...answers, [questionId]: option };
        setAnswers(newAnswers);

        if (currentQuestionIndex < onboardingData.questions.length - 1) {
            setCurrentQuestionIndex(prev => prev + 1);
        } else {
            handleComplete(newAnswers);
        }
    };

    const handleComplete = async (finalAnswers) => {
        setStep('synthesizing');
        try {
            const { profile } = await api.post('/ai/onboarding/profile', finalAnswers);
            setStep('complete');
            setTimeout(() => {
                onProfileGenerated(profile);
            }, 1000);
        } catch (err) {
            console.error('Failed to synthesize profile:', err);
            onProfileGenerated('Standard learning profile');
        }
    };

    if (step === 'loading') {
        return (
            <div className="flex flex-col items-center justify-center p-8 animate-pulse">
                <BrainCircuit className="w-12 h-12 text-primary-400 mb-4 animate-bounce" />
                <p className="text-sm font-bold text-white uppercase tracking-widest">Consulting Document...</p>
                <p className="text-[10px] text-dark-400 mt-2">The tutor is analyzing the content for you.</p>
            </div>
        );
    }

    if (error) {
        return <div className="text-xs text-red-400 p-4">{error}</div>;
    }

    if (step === 'questions' && onboardingData) {
        const currentQuestion = onboardingData.questions[currentQuestionIndex];
        const progress = ((currentQuestionIndex) / onboardingData.questions.length) * 100;

        return (
            <div className="flex flex-col h-full animate-fade-in">
                <div className="mb-6">
                    <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="w-4 h-4 text-primary-400" />
                        <p className="text-[10px] font-bold text-primary-300 uppercase tracking-wider">Tutor Orientation</p>
                    </div>
                    <h4 className="text-sm font-medium text-white leading-relaxed">
                        {currentQuestionIndex === 0 ? onboardingData.intro : currentQuestion.text}
                    </h4>
                </div>

                {currentQuestionIndex === 0 && (
                    <p className="text-xs text-dark-300 mb-4 italic">"{currentQuestion.text}"</p>
                )}

                <div className="space-y-2 mb-8">
                    {currentQuestion.options.map((option, idx) => (
                        <button
                            key={idx}
                            onClick={() => handleAnswer(currentQuestion.id, option)}
                            className="w-full text-left p-4 rounded-xl bg-white/5 border border-white/10 hover:border-primary-500/50 hover:bg-primary-500/5 transition-all group flex items-center justify-between"
                        >
                            <span className="text-sm text-dark-200 group-hover:text-white transition-colors">{option}</span>
                            <ChevronRight className="w-4 h-4 text-dark-500 group-hover:text-primary-400 opacity-0 group-hover:opacity-100 transition-all" />
                        </button>
                    ))}
                </div>

                <div className="mt-auto">
                    <div className="flex items-center justify-between text-[10px] uppercase font-bold text-dark-500 mb-2">
                        <span>Question {currentQuestionIndex + 1} of {onboardingData.questions.length}</span>
                        <span>{Math.round(progress)}% Complete</span>
                    </div>
                    <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-primary-500 transition-all duration-500"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>
            </div>
        );
    }

    if (step === 'synthesizing') {
        return (
            <div className="flex flex-col items-center justify-center p-8">
                <Loader2 className="w-12 h-12 text-primary-400 mb-4 animate-spin" />
                <p className="text-sm font-bold text-white uppercase tracking-widest">Building your profile...</p>
                <p className="text-[10px] text-dark-400 mt-2">Personalizing the AI's understanding.</p>
            </div>
        );
    }

    if (step === 'complete') {
        return (
            <div className="flex flex-col items-center justify-center p-8 animate-fade-in">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mb-4" />
                <p className="text-sm font-bold text-emerald-400 uppercase tracking-widest">Tutor Initialized!</p>
                <p className="text-[10px] text-dark-400 mt-2">Ready to generate "No Compromise" results.</p>
            </div>
        );
    }

    return null;
};

export default DiscoveryAgent;
