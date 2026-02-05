import React, { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import {
    Play,
    Clock,
    Flame,
    Target,
    CheckCircle2,
    Settings,
    ChevronRight,
    Calendar,
    Zap,
    TrendingUp,
    BookOpen
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../services/api';
import SmartTimer from '../components/SmartTimer';
import GoalProgress from '../components/GoalProgress';
import StreakProtection from '../components/analytics/StreakProtection';
import AbstractBackground from '../components/ui/AbstractBackground';

/**
 * Dashboard Page Component - Redesigned
 * 
 * Streamlined layout focusing on actionable items:
 * - Hero section with primary CTA
 * - Quick stats
 * - Prominent timer
 * - Activity + Upcoming
 * - Knowledge mastery bar
 */
const Dashboard = () => {
    const navigate = useNavigate();
    const { openSettings } = useOutletContext();
    const [overview, setOverview] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [upcoming, setUpcoming] = useState({});
    const [activities, setActivities] = useState([]);
    const [streakStatus, setStreakStatus] = useState(null);

    useEffect(() => {
        const fetchDashboardData = async () => {
            try {
                const [overviewData, upcomingData, activityData, streakData] = await Promise.all([
                    api.get('/analytics/overview'),
                    api.get('/study/upcoming'),
                    api.get('/analytics/activity?limit=4'),
                    api.get('/analytics/streak-status')
                ]);
                setOverview(overviewData);
                setUpcoming(upcomingData);
                setActivities(activityData);
                setStreakStatus(streakData);
            } catch (err) {
                console.error('Failed to fetch dashboard data', err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchDashboardData();
    }, []);

    const stats = [
        {
            label: 'Due Today',
            value: overview?.cards_due_today || 0,
            icon: Clock,
            color: 'from-amber-500 to-orange-500',
            glow: 'shadow-amber-500/20'
        },
        {
            label: 'Study Streak',
            value: `${overview?.study_streak || 0}`,
            suffix: 'days',
            icon: Flame,
            color: 'from-orange-500 to-red-500',
            glow: 'shadow-orange-500/20'
        },
        {
            label: 'Retention',
            value: `${overview?.retention_rate || 0}%`,
            icon: Target,
            color: 'from-primary-500 to-indigo-500',
            glow: 'shadow-primary-500/20'
        },
        {
            label: 'Total Cards',
            value: overview?.total_flashcards || 0,
            icon: CheckCircle2,
            color: 'from-emerald-500 to-teal-500',
            glow: 'shadow-emerald-500/20'
        },
    ];

    const getTimeOfDay = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good morning';
        if (hour < 17) return 'Good afternoon';
        return 'Good evening';
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full min-h-[60vh]">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                    className="w-12 h-12 border-2 border-primary-500/30 border-t-primary-500 rounded-full"
                />
            </div>
        );
    }

    return (
        <>
            <AbstractBackground />

            <div className="relative z-10 space-y-8 pb-20">
                {/* Hero Header */}
                <header className="relative">
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                        <div>
                            <motion.p
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="text-primary-400 text-sm font-medium mb-2"
                            >
                                {getTimeOfDay()}
                            </motion.p>
                            <motion.h1
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 }}
                                className="text-4xl md:text-5xl font-black tracking-tight text-white"
                            >
                                Ready to Learn?
                            </motion.h1>
                            <motion.p
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.2 }}
                                className="text-dark-400 mt-3 max-w-md"
                            >
                                {overview?.cards_due_today > 0
                                    ? `You have ${overview.cards_due_today} cards waiting for review.`
                                    : "You're all caught up! Time to learn something new."}
                            </motion.p>
                        </div>

                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.3 }}
                            className="flex gap-3"
                        >
                            <button
                                onClick={openSettings}
                                className="p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
                            >
                                <Settings className="w-5 h-5 text-dark-400" />
                            </button>
                            <button
                                onClick={() => navigate('/practice')}
                                className="group flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-primary-600 to-primary-500 hover:from-primary-500 hover:to-primary-400 text-white font-bold rounded-xl shadow-lg shadow-primary-500/25 transition-all hover:shadow-primary-500/40 hover:scale-[1.02] active:scale-[0.98]"
                            >
                                <Play className="w-5 h-5 fill-current" />
                                Start Studying
                                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                            </button>
                        </motion.div>
                    </div>
                </header>

                {/* Quick Stats */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="grid grid-cols-2 lg:grid-cols-4 gap-4"
                >
                    {stats.map((stat, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4 + i * 0.1 }}
                            className={`relative overflow-hidden p-5 rounded-2xl bg-dark-900/60 backdrop-blur-sm border border-white/5 hover:border-white/10 transition-all group cursor-pointer shadow-lg ${stat.glow}`}
                            onClick={() => navigate('/practice')}
                        >
                            <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${stat.color} opacity-10 blur-2xl group-hover:opacity-20 transition-opacity`} />
                            <div className="relative">
                                <stat.icon className={`w-5 h-5 mb-3 bg-gradient-to-r ${stat.color} bg-clip-text`} style={{ color: 'transparent', backgroundClip: 'text', WebkitTextFillColor: 'transparent', WebkitBackgroundClip: 'text' }} />
                                <p className="text-[10px] font-bold uppercase tracking-widest text-dark-500 mb-1">{stat.label}</p>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-2xl font-black text-white">{stat.value}</span>
                                    {stat.suffix && <span className="text-sm text-dark-400">{stat.suffix}</span>}
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </motion.div>

                {/* Streak Protection Banner */}
                <AnimatePresence>
                    {streakStatus?.at_risk && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                        >
                            <StreakProtection
                                data={streakStatus}
                                onStudyNow={() => navigate('/practice')}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Smart Timer - Prominent */}
                <motion.section
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                >
                    <SmartTimer />
                </motion.section>

                {/* Goal Progress */}
                <motion.section
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.65 }}
                >
                    <GoalProgress />
                </motion.section>

                {/* Activity & Upcoming Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                    {/* Recent Activity */}
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.7 }}
                        className="lg:col-span-3 p-6 rounded-2xl bg-dark-900/60 backdrop-blur-sm border border-white/5"
                    >
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                <Zap className="w-4 h-4 text-primary-400" />
                                Recent Activity
                            </h3>
                            <button className="text-[10px] font-bold uppercase tracking-widest text-dark-500 hover:text-primary-400 transition-colors">
                                View All
                            </button>
                        </div>
                        <div className="space-y-3">
                            {activities.length > 0 ? (
                                activities.map((activity) => (
                                    <div key={activity.id} className="flex items-center gap-4 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors">
                                        <div className="w-8 h-8 rounded-lg bg-primary-500/10 flex items-center justify-center">
                                            {activity.activity_type === 'view_document' ? <BookOpen className="w-4 h-4 text-primary-400" /> :
                                                activity.activity_type === 'create_flashcard' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> :
                                                    <TrendingUp className="w-4 h-4 text-amber-400" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm text-white truncate">{activity.description}</p>
                                            <p className="text-[10px] text-dark-500">{new Date(activity.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="flex flex-col items-center justify-center py-10 text-dark-500">
                                    <Zap className="w-8 h-8 opacity-20 mb-2" />
                                    <p className="text-sm">No activity yet</p>
                                </div>
                            )}
                        </div>
                    </motion.div>

                    {/* Upcoming Reviews */}
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.8 }}
                        className="lg:col-span-2 p-6 rounded-2xl bg-dark-900/60 backdrop-blur-sm border border-white/5"
                    >
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-cyan-400" />
                                Upcoming
                            </h3>
                        </div>
                        <div className="space-y-2">
                            {Object.keys(upcoming).length > 0 ? (
                                Object.entries(upcoming).slice(0, 5).map(([date, items]) => (
                                    <div key={date} className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                                        <div>
                                            <p className="text-sm font-medium text-white">
                                                {new Date(date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-dark-400">{items.length}</span>
                                            <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="flex flex-col items-center justify-center py-10 text-dark-500">
                                    <Calendar className="w-8 h-8 opacity-20 mb-2" />
                                    <p className="text-sm">All caught up!</p>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>

                {/* Knowledge Mastery Bar */}
                {overview?.total_flashcards > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.9 }}
                        className="p-6 rounded-2xl bg-dark-900/60 backdrop-blur-sm border border-white/5"
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-bold text-white">Knowledge Mastery</h3>
                            <span className="text-[10px] font-bold text-dark-500 uppercase tracking-widest">
                                {overview?.total_flashcards} Cards Total
                            </span>
                        </div>
                        <div className="h-3 bg-dark-800 rounded-full overflow-hidden flex">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${(overview?.srs_distribution?.new / overview?.total_flashcards * 100) || 0}%` }}
                                transition={{ delay: 1, duration: 0.8 }}
                                className="h-full bg-slate-600"
                                title={`New: ${overview?.srs_distribution?.new || 0}`}
                            />
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${(overview?.srs_distribution?.learning / overview?.total_flashcards * 100) || 0}%` }}
                                transition={{ delay: 1.1, duration: 0.8 }}
                                className="h-full bg-cyan-500"
                                title={`Learning: ${overview?.srs_distribution?.learning || 0}`}
                            />
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${(overview?.srs_distribution?.mastered / overview?.total_flashcards * 100) || 0}%` }}
                                transition={{ delay: 1.2, duration: 0.8 }}
                                className="h-full bg-emerald-500"
                                title={`Mastered: ${overview?.srs_distribution?.mastered || 0}`}
                            />
                        </div>
                        <div className="flex justify-between mt-3 text-[10px] font-bold uppercase tracking-widest text-dark-500">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-slate-600" />
                                <span>New ({overview?.srs_distribution?.new || 0})</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-cyan-500" />
                                <span>Learning ({overview?.srs_distribution?.learning || 0})</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                <span>Mastered ({overview?.srs_distribution?.mastered || 0})</span>
                            </div>
                        </div>
                    </motion.div>
                )}
            </div>
        </>
    );
};

export default Dashboard;
