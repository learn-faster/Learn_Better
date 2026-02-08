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
 * - Dedicated Goal Agent Section
 */
const Dashboard = () => {
    const navigate = useNavigate();
    const { openSettings } = useOutletContext();
    const [dashboard, setDashboard] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activities, setActivities] = useState([]);
    const [streakStatus, setStreakStatus] = useState(null);


    useEffect(() => {
        const fetchDashboardData = async () => {
            try {
                const [dashboardData, activityData] = await Promise.all([
                    api.get('/dashboard/overview'),
                    api.get('/analytics/activity?limit=4'),
                ]);
                setDashboard(dashboardData);
                setActivities(activityData);
                setStreakStatus(dashboardData?.streak_status || null);
            } catch (err) {
                console.error('Failed to fetch dashboard data', err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchDashboardData();
    }, []);

    const toggleDailyPlan = async (itemId, completed) => {
        try {
            const res = await api.patch(`/goals/daily-plan/${itemId}`, { completed: !completed });
            setDashboard((prev) => {
                if (!prev || !prev.today_plan) return prev;
                const updatedItems = prev.today_plan.items.map((it) =>
                    it.id === itemId ? { ...it, completed: res.completed, completed_at: res.completed_at } : it
                );
                const completedCount = updatedItems.filter((it) => it.completed).length;
                const minutesPlanned = updatedItems.reduce((sum, it) => sum + (it.duration_minutes || 0), 0);
                const minutesCompleted = updatedItems.filter((it) => it.completed).reduce((sum, it) => sum + (it.duration_minutes || 0), 0);
                return {
                    ...prev,
                    today_plan: {
                        ...prev.today_plan,
                        items: updatedItems,
                        total_count: updatedItems.length,
                        completed_count: completedCount,
                        minutes_planned: minutesPlanned,
                        minutes_completed: minutesCompleted
                    }
                };
            });
        } catch (err) {
            console.error('Failed to update daily plan item', err);
        }
    };

    const stats = [
        {
            label: 'Due Today',
            value: dashboard?.due_today || 0,
            icon: Clock,
            color: 'from-amber-500 to-orange-500',
            glow: 'shadow-amber-500/20'
        },
        {
            label: 'Study Streak',
            value: `${dashboard?.streak_status?.streak || 0}`,
            suffix: 'days',
            icon: Flame,
            color: 'from-orange-500 to-red-500',
            glow: 'shadow-orange-500/20'
        },
        {
            label: 'Retention',
            value: `${dashboard?.retention_rate || 0}%`,
            icon: Target,
            color: 'from-primary-500 to-indigo-500',
            glow: 'shadow-primary-500/20'
        },
        {
            label: 'Velocity',
            value: dashboard?.velocity || 0,
            suffix: 'cards/hr',
            icon: TrendingUp,
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

            <div className="relative z-10 space-y-8 pb-16">
                {/* Dashboard Grid with Agent */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

                    {/* Left Column: Hero & Stats */}
                    <div className="lg:col-span-2 space-y-8">
                        {/* Hero Header */}
                        <header className="relative">
                            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                                <div>
                                    <motion.p
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="text-primary-300 text-xs font-semibold uppercase tracking-[0.2em] mb-2"
                                    >
                                        {getTimeOfDay()}
                                    </motion.p>
                                    <motion.h1
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.1 }}
                                        className="text-3xl md:text-5xl font-black tracking-tight text-white"
                                    >
                                        Ready to Learn?
                                    </motion.h1>
                                    <motion.p
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ delay: 0.2 }}
                                        className="text-dark-400 mt-3 max-w-md text-sm md:text-base"
                                    >
                                        {dashboard?.due_today > 0
                                            ? `You have ${dashboard.due_today} cards waiting for review.`
                                            : "You're all caught up! Time to learn something new."}
                                    </motion.p>
                                    {!!dashboard?.today_plan && (
                                        <motion.p
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{ delay: 0.25 }}
                                            className="text-xs text-dark-500 mt-2"
                                        >
                                            {dashboard.today_plan.completed_count}/{dashboard.today_plan.total_count} tasks complete · {dashboard.today_plan.minutes_completed}/{dashboard.today_plan.minutes_planned} min
                                        </motion.p>
                                    )}
                                </div>
                            </div>
                        </header>

                        {/* Quick Stats */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4 }}
                            className="grid grid-cols-2 md:grid-cols-4 gap-4"
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
                                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-dark-500 mb-1">{stat.label}</p>
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-2xl font-black text-white">{stat.value}</span>
                                            {stat.suffix && <span className="text-sm text-dark-400">{stat.suffix}</span>}
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </motion.div>

                        {/* Start Button Mobile Only (Visible on small screens) */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.3 }}
                            className="flex gap-3 lg:hidden"
                        >
                            <button
                                onClick={() => navigate('/practice')}
                                className="w-full group flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-primary-600 to-primary-500 hover:from-primary-500 hover:to-primary-400 text-white font-bold rounded-xl shadow-lg shadow-primary-500/25 transition-all active:scale-[0.98]"
                            >
                                <Play className="w-5 h-5 fill-current" />
                                Start Studying
                            </button>
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

                        {/* Smart Timer */}
                        <motion.section
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.6 }}
                        >
                            <SmartTimer />
                        </motion.section>

                        {/* Recent Activity */}
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.7 }}
                            className="p-6 rounded-2xl bg-dark-900/60 backdrop-blur-sm border border-white/5"
                        >
                            {/* ... Activity content (same as before) ... */}
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
                    </div>

                    {/* Right Column reserved for future widgets */}
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.5 }}
                        className="lg:col-span-1 relative z-20"
                    >
                        <div className="sticky top-6 space-y-6">
                            <GoalProgress />

                            <div className="p-6 rounded-2xl bg-dark-900/60 backdrop-blur-sm border border-white/5">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                        <Calendar className="w-4 h-4 text-primary-400" />
                                        Today’s Plan
                                    </h3>
                                    <button
                                        onClick={() => navigate('/practice')}
                                        className="text-[10px] font-bold uppercase tracking-widest text-dark-500 hover:text-primary-400 transition-colors"
                                    >
                                        Start
                                    </button>
                                </div>
                            <div className="space-y-3">
                                {(dashboard?.today_plan?.items || []).map((item) => (
                                    <div key={item.id} className={`p-3 rounded-xl bg-white/5 border ${item.completed ? 'border-emerald-500/30' : 'border-white/5'} hover:border-white/10 transition-colors`}>
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                    <button
                                                        onClick={() => toggleDailyPlan(item.id, item.completed)}
                                                        className="flex items-start gap-2 text-left"
                                                    >
                                                        <span className={`mt-0.5 w-4 h-4 rounded-md border flex items-center justify-center ${item.completed ? 'bg-emerald-500/80 border-emerald-400' : 'border-white/15'}`}>
                                                            {item.completed && <CheckCircle2 className="w-3 h-3 text-white" />}
                                                        </span>
                                                        <span className={`text-sm font-semibold ${item.completed ? 'text-emerald-200 line-through' : 'text-white'}`}>{item.title}</span>
                                                    </button>
                                                    {item.notes && (
                                                        <p className="text-[11px] text-dark-500 mt-1">{item.notes}</p>
                                                    )}
                                                </div>
                                                <span className="text-[10px] font-black uppercase tracking-widest text-dark-400">
                                                    {item.duration_minutes}m
                                                </span>
                                            </div>
                                    </div>
                                ))}
                                    {(!dashboard?.today_plan?.items || dashboard.today_plan.items.length === 0) && (
                                        <div className="py-6 text-center text-xs text-dark-500">
                                            No plan yet. Start a focus block to generate one.
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Goal Pacing */}
                            <div className="p-6 rounded-2xl bg-dark-900/60 backdrop-blur-sm border border-white/5">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                        <Target className="w-4 h-4 text-primary-400" />
                                        Goal Pacing
                                    </h3>
                                    <button
                                        onClick={() => navigate('/learning-path')}
                                        className="text-[10px] font-bold uppercase tracking-widest text-dark-500 hover:text-primary-400 transition-colors"
                                    >
                                        Manage
                                    </button>
                                </div>
                                <div className="space-y-3">
                                    {(dashboard?.goal_pacing || []).map((goal) => (
                                        <div key={goal.goal_id} className="p-3 rounded-xl bg-white/5 border border-white/5">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-sm font-semibold text-white">{goal.title}</p>
                                                    <p className="text-[10px] text-dark-500">
                                                        {goal.required_minutes_per_day > 0 ? `${goal.required_minutes_per_day} min/day` : "No deadline set"}
                                                    </p>
                                                </div>
                                                <span className={`text-[10px] font-bold uppercase tracking-widest ${goal.status === 'on_track' ? 'text-emerald-400' : goal.status === 'overdue' ? 'text-red-400' : 'text-amber-400'}`}>
                                                    {goal.status.replace('_', ' ')}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                    {(!dashboard?.goal_pacing || dashboard.goal_pacing.length === 0) && (
                                        <div className="py-4 text-center text-xs text-dark-500">No active goals yet.</div>
                                    )}
                                </div>
                            </div>

                            {/* Focus Summary */}
                            <div className="p-6 rounded-2xl bg-dark-900/60 backdrop-blur-sm border border-white/5">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                        <Clock className="w-4 h-4 text-primary-400" />
                                        Focus Summary
                                    </h3>
                                </div>
                                <div className="grid grid-cols-2 gap-3 text-xs">
                                    <div className="p-3 rounded-xl bg-white/5">
                                        <p className="text-dark-500 uppercase tracking-widest font-bold mb-1">Today</p>
                                        <p className="text-lg font-black text-white">{dashboard?.focus_summary?.minutes_today || 0}m</p>
                                    </div>
                                    <div className="p-3 rounded-xl bg-white/5">
                                        <p className="text-dark-500 uppercase tracking-widest font-bold mb-1">Last 7 days</p>
                                        <p className="text-lg font-black text-white">{dashboard?.focus_summary?.minutes_last_7_days || 0}m</p>
                                    </div>
                                </div>
                            </div>

                            {/* Insights */}
                            <div className="p-6 rounded-2xl bg-dark-900/60 backdrop-blur-sm border border-white/5">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                        <Zap className="w-4 h-4 text-primary-400" />
                                        Insights
                                    </h3>
                                </div>
                                <div className="space-y-3">
                                    {(dashboard?.insights || []).map((insight) => (
                                        <div key={insight.id} className="p-3 rounded-xl bg-white/5 border border-white/5">
                                            <p className="text-sm font-semibold text-white">{insight.title}</p>
                                            <p className="text-[11px] text-dark-500 mt-1">{insight.message}</p>
                                            {insight.action_label && (
                                                <button
                                                    onClick={() => navigate(insight.action_route || '/practice')}
                                                    className="text-[10px] font-bold uppercase tracking-widest text-primary-400 mt-2"
                                                >
                                                    {insight.action_label} →
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                    {(!dashboard?.insights || dashboard.insights.length === 0) && (
                                        <div className="py-4 text-center text-xs text-dark-500">No insights yet.</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </motion.div>

                </div>
            </div>
        </>
    );
};

export default Dashboard;
