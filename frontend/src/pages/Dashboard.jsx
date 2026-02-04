import React, { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import {
    Plus,
    Play,
    TrendingUp,
    Calendar,
    Flame,
    Target,
    CheckCircle2,
    Clock,
    BrainCircuit,
    Settings,
    Eye
} from 'lucide-react';
import Card from '../components/ui/Card';
import useStudyStore from '../stores/useStudyStore';
import api from '../services/api';
import CognitiveDashboard from '../components/CognitiveDashboard';
import SmartTimer from '../components/SmartTimer';

/**
 * Dashboard Page Component.
 * 
 * The primary landing page for the application.
 * Highlights:
 * - High-level study statistics (Due cards, Streak, Retention).
 * - Recent activity log (Memory events).
 * - Upcoming review forecast.
 * - Knowledge mastery visualization (SRS Distribution).
 * - Direct access to AI settings and starting study sessions.
 * 
 * @returns {JSX.Element} The rendered dashboard page.
 */
const Dashboard = () => {
    const navigate = useNavigate();
    const { openSettings } = useOutletContext();
    const [overview, setOverview] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [upcoming, setUpcoming] = useState({});
    const [activities, setActivities] = useState([]);
    const [showActiveRecallModal, setShowActiveRecallModal] = useState(false);

    useEffect(() => {
        const fetchDashboardData = async () => {
            try {
                const [overviewData, upcomingData, activityData] = await Promise.all([
                    api.get('/analytics/overview'),
                    api.get('/study/upcoming'),
                    api.get('/analytics/activity?limit=5')
                ]);
                setOverview(overviewData);
                setUpcoming(upcomingData);
                setActivities(activityData);
            } catch (err) {
                console.error('Failed to fetch dashboard data', err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchDashboardData();
    }, []);

    const stats = [
        { label: 'Due Today', value: overview?.cards_due_today || 0, icon: Clock, color: 'text-amber-400', bg: 'bg-amber-400/10' },
        { label: 'Study Streak', value: `${overview?.study_streak || 0} Days`, icon: Flame, color: 'text-orange-500', bg: 'bg-orange-500/10' },
        { label: 'Retention', value: `${overview?.retention_rate || 0}%`, icon: Target, color: 'text-primary-400', bg: 'bg-primary-400/10' },
        { label: 'Total Cards', value: overview?.total_flashcards || 0, icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
    ];

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
            </div>
        );
    }

    return (
        <div className="space-y-10 pb-20">
            {/* Header */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
                        Cognitive Control
                    </h1>
                    <p className="text-dark-400 mt-2 font-medium">Monitoring your knowledge synthesis and memory loops.</p>
                </div>
                <div className="flex gap-4">
                    <button
                        onClick={openSettings}
                        className="btn-secondary group"
                    >
                        <Settings className="w-5 h-5 group-hover:rotate-45 transition-transform" />
                    </button>
                    <button
                        onClick={() => navigate('/practice')}
                        className="btn-primary"
                    >
                        <Play className="w-5 h-5 fill-current" />
                        Enter Practice
                    </button>
                </div>
            </header>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {stats.map((stat, i) => (
                    <Card key={i} className="py-8 text-center hover:scale-[1.05] transition-transform duration-500 glass border-white/5">
                        <div className={`mx-auto w-14 h-14 rounded-2xl ${stat.bg} flex items-center justify-center mb-4 border border-white/5 shadow-lg`}>
                            <stat.icon className={`w-7 h-7 ${stat.color}`} />
                        </div>
                        <p className="text-dark-500 text-[10px] font-bold uppercase tracking-[0.2em]">{stat.label}</p>
                        <h3 className="text-3xl font-black mt-2 text-white">{stat.value}</h3>
                    </Card>
                ))}
            </div>

            {/* Cognitive Workspace Section */}
            <section className="bg-dark-900/40 rounded-[2.5rem] p-10 border border-white/5 shadow-2xl backdrop-blur-3xl">
                <div className="flex items-center gap-3 mb-10 text-dark-500">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse shadow-[0_0_10px_rgba(139,92,246,0.8)]" />
                    <h2 className="text-xs font-black uppercase tracking-[0.3em] text-primary-400/70">Neural Workspace</h2>
                </div>
                <div className="space-y-10">
                    <CognitiveDashboard />
                    <div className="h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />
                    <SmartTimer />
                </div>
            </section>

            {/* Main Content Info */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Recent Activity (Memory) */}
                <Card title="Memory" subtitle="Recent actions and progress" className="lg:col-span-2">
                    <div className="space-y-4">
                        {activities.length > 0 ? (
                            activities.map((activity) => (
                                <div key={activity.id} className="flex items-start gap-4 p-4 rounded-xl bg-white/5 border border-white/5 hover:border-primary-500/30 transition-colors">
                                    <div className="p-2 rounded-lg bg-dark-800">
                                        {activity.activity_type === 'view_document' ? <Clock className="w-4 h-4 text-blue-400" /> :
                                            activity.activity_type === 'create_flashcard' ? <Plus className="w-4 h-4 text-emerald-400" /> :
                                                <BrainCircuit className="w-4 h-4 text-primary-400" />}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between">
                                            <p className="text-sm font-semibold text-white">{activity.description}</p>
                                            <span className="text-[10px] text-dark-500 uppercase tracking-widest">{new Date(activity.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>
                                        <p className="text-xs text-dark-400 mt-0.5">{new Date(activity.timestamp).toLocaleDateString()}</p>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="h-[200px] flex items-center justify-center border-2 border-dashed border-white/5 rounded-xl">
                                <p className="text-dark-500">Your activity history will appear here</p>
                            </div>
                        )}
                    </div>
                </Card>

                {/* Upcoming Reviews */}
                <Card title="Upcoming" subtitle="Scheduled reviews next 7 days">
                    <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                        {Object.keys(upcoming).length > 0 ? (
                            Object.entries(upcoming).map(([date, items]) => (
                                <div key={date} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5">
                                    <div>
                                        <p className="text-sm font-semibold">{new Date(date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                                        <p className="text-xs text-dark-500">{items.length} cards due</p>
                                    </div>
                                    <div className="w-2 h-2 rounded-full bg-primary-500 shadow-[0_0_10px_rgba(139,92,246,0.5)]" />
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-12 text-dark-600">
                                <Calendar className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                <p>No upcoming reviews scheduled</p>
                            </div>
                        )}
                    </div>
                </Card>
            </div>

            {/* Active Recall Info Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-4">
                <div className="bg-gradient-to-br from-indigo-600/20 to-purple-600/20 p-8 rounded-3xl border border-indigo-500/20 relative overflow-hidden group">
                    <div className="relative z-10">
                        <h3 className="text-2xl font-bold mb-3">Power of Active Recall</h3>
                        <p className="text-indigo-200/70 leading-relaxed mb-6">
                            Retrieval practice is the single most powerful technique for strengthening memory. Instead of re-reading, test yourself.
                        </p>
                        <button
                            onClick={() => setShowActiveRecallModal(true)}
                            className="flex items-center gap-2 text-white font-semibold hover:gap-3 transition-all"
                        >
                            Learn more techniques <Plus className="w-4 h-4" />
                        </button>
                    </div>
                    <BrainCircuit className="absolute top-[-20px] right-[-20px] w-48 h-48 text-white/5 group-hover:text-white/10 transition-colors" />
                </div>

                <div className="bg-gradient-to-br from-cyan-600/20 to-blue-600/20 p-8 rounded-3xl border border-cyan-500/20 relative overflow-hidden group">
                    <div className="relative z-10">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-2xl font-bold">Spaced Repetition</h3>
                            <button
                                onClick={() => navigate('/practice')}
                                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                            >
                                <Play className="w-5 h-5 fill-current" />
                            </button>
                        </div>

                        {/* Mastery Track */}
                        <div className="mb-8">
                            <div className="flex justify-between text-xs font-bold uppercase tracking-wider text-cyan-200/70 mb-2">
                                <span>Knowledge Mastery</span>
                                <span>{overview?.total_flashcards || 0} Cards</span>
                            </div>
                            <div className="h-4 bg-black/40 rounded-full overflow-hidden flex">
                                {/* New */}
                                <div
                                    className="h-full bg-slate-500/50 hover:bg-slate-500 transition-colors"
                                    style={{ width: `${(overview?.srs_distribution?.new / overview?.total_flashcards * 100) || 0}%` }}
                                    title={`New: ${overview?.srs_distribution?.new || 0}`}
                                />
                                {/* Learning */}
                                <div
                                    className="h-full bg-cyan-500 hover:bg-cyan-400 transition-colors shadow-[0_0_10px_rgba(6,182,212,0.5)]"
                                    style={{ width: `${(overview?.srs_distribution?.learning / overview?.total_flashcards * 100) || 0}%` }}
                                    title={`Learning: ${overview?.srs_distribution?.learning || 0}`}
                                />
                                {/* Mastered */}
                                <div
                                    className="h-full bg-emerald-500 hover:bg-emerald-400 transition-colors shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                                    style={{ width: `${(overview?.srs_distribution?.mastered / overview?.total_flashcards * 100) || 0}%` }}
                                    title={`Mastered: ${overview?.srs_distribution?.mastered || 0}`}
                                />
                            </div>
                            <div className="flex justify-between mt-2 text-[10px] font-bold uppercase tracking-widest text-dark-400">
                                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-slate-500/50"></div> New</div>
                                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-cyan-500"></div> Learning</div>
                                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Mastered</div>
                            </div>
                        </div>

                        {/* Up Next List */}
                        <div>
                            <h4 className="text-sm font-bold text-cyan-100 mb-3 flex items-center gap-2">
                                <Clock className="w-4 h-4" /> Next Up
                            </h4>
                            <div className="space-y-2">
                                {Object.keys(upcoming).sort().slice(0, 1).flatMap(date => upcoming[date].slice(0, 3)).length > 0 ? (
                                    Object.keys(upcoming).sort().slice(0, 1).flatMap(date => upcoming[date].slice(0, 3)).map(card => (
                                        <div key={card.id} className="bg-black/20 p-3 rounded-lg border border-white/5 flex items-center justify-between">
                                            <span className="text-sm truncate max-w-[200px]">{card.front}</span>
                                            <span className="text-[10px] bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded uppercase font-bold tracking-wider">Due</span>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-xs text-cyan-200/50 italic">All caught up! No reviews pending.</div>
                                )}
                            </div>
                        </div>

                    </div>
                    <Clock className="absolute top-[-20px] right-[-20px] w-48 h-48 text-white/5 group-hover:text-white/10 transition-colors" />
                </div>
            </div>

            {/* Active Recall Modal */}
            {showActiveRecallModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => setShowActiveRecallModal(false)}>
                    <div className="bg-dark-900 border border-white/10 rounded-2xl max-w-2xl w-full p-8 shadow-2xl relative" onClick={e => e.stopPropagation()}>
                        <button
                            onClick={() => setShowActiveRecallModal(false)}
                            className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-lg transition-colors"
                        >
                            <Plus className="w-6 h-6 rotate-45 text-dark-400" />
                        </button>

                        <div className="flex items-center gap-4 mb-6">
                            <div className="p-3 rounded-xl bg-indigo-500/20 text-indigo-400">
                                <BrainCircuit className="w-8 h-8" />
                            </div>
                            <h2 className="text-2xl font-bold">Active Recall Techniques</h2>
                        </div>

                        <div className="space-y-6 text-dark-200">
                            <p className="leading-relaxed">
                                Active recall involves <strong>retrieving information from memory</strong> rather than passively reviewing it.
                                Here are valid ways to practice it with this app:
                            </p>

                            <div className="grid gap-4">
                                <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                                    <h4 className="font-bold text-white mb-2 flex items-center gap-2">
                                        <CheckCircle2 className="w-4 h-4 text-emerald-400" /> 1. The Flashcard Method
                                    </h4>
                                    <p className="text-sm text-dark-400">
                                        Don't just flip the card. <strong>Say the answer out loud</strong> or write it down
                                        before revealing the back. This forces your brain to create strong neural pathways.
                                    </p>
                                </div>

                                <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                                    <h4 className="font-bold text-white mb-2 flex items-center gap-2">
                                        <CheckCircle2 className="w-4 h-4 text-emerald-400" /> 2. The Feynman Technique
                                    </h4>
                                    <p className="text-sm text-dark-400">
                                        Identify a complex concept in the "Question" field. In the "Answer",
                                        <strong>distill the explanation</strong> to its core principles, ensuring
                                        the logic is intuitive and easily understood.
                                    </p>
                                </div>

                                <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                                    <h4 className="font-bold text-white mb-2 flex items-center gap-2">
                                        <CheckCircle2 className="w-4 h-4 text-emerald-400" /> 3. SQ3R (Survey, Question, Read...)
                                    </h4>
                                    <p className="text-sm text-dark-400">
                                        Before reading a document, turn headings into questions using the
                                        <strong> Flashcard Creator</strong>. Then read to find the answers.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="mt-8 flex justify-end">
                            <button
                                onClick={() => {
                                    setShowActiveRecallModal(false);
                                    navigate('/practice');
                                }}
                                className="btn-primary"
                            >
                                <Play className="w-4 h-4 fill-current" />
                                Start Practicing
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Dashboard;
