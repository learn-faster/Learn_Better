import React from 'react';
import { NavLink } from 'react-router-dom';
import {
    LayoutDashboard,
    Files,
    Library,
    GraduationCap,
    BarChart3,
    BrainCircuit,
    Network,
    Map,
    Scan,
    FileText,
    Settings,
    Clock,
    CheckSquare,
    Mail
} from 'lucide-react';
import useTimerStore from '../../stores/useTimerStore';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion } from 'framer-motion';

/**
 * Utility for merging Tailwind classes safely.
 */
function cn(...inputs) {
    return twMerge(clsx(inputs));
}

const FocusStatus = () => {
    const { timeLeft, isActive, activeSessionId, mode, studyType, goal } = useTimerStore();

    if (!activeSessionId && !isActive) return null;

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 mx-2 p-3 rounded-2xl bg-primary-500/10 border border-primary-500/20 group/focus"
        >
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary-500/20 flex items-center justify-center shrink-0">
                    <Clock className={cn("w-5 h-5 text-primary-400", isActive && "animate-pulse")} />
                </div>
                <div className="hidden md:block min-w-0">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-primary-400 font-mono">
                            {formatTime(timeLeft)}
                        </span>
                        <div className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    </div>
                    <p className="text-[10px] font-bold text-white/50 uppercase tracking-tighter truncate mt-0.5">
                        {goal || (mode === 'WORK' ? 'Deep Work' : 'Break')}
                    </p>
                </div>
            </div>
            {/* Tiny progress dot indicator for collapsed mode */}
            <div className="md:hidden flex justify-center mt-2">
                <div className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-primary-500 animate-pulse' : 'bg-dark-500'}`} />
            </div>
        </motion.div>
    );
};

/**
 * Global Navigation Sidebar Component.
 * 
 * Provides top-level navigation between the Dashboard, Documents, Study, 
 * Flashcards, Analytics, and Learning Path.
 * Adapts to screen size (icon-only on small, full width on large).
 * 
 * @returns {JSX.Element} The rendered navigation menu.
 */
const Navbar = ({ onOpenSettings }) => {
    /**
     * Configuration for primary navigation links.
     */
    const navItems = [
        { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
        { to: '/documents', icon: Files, label: 'Documents' },
        { to: '/practice', icon: GraduationCap, label: 'Practice' },
        { to: '/knowledge-graph', icon: Network, label: 'Knowledge Map' },
        { to: '/curriculum', icon: Map, label: 'Curriculum' },
        { to: '/daily-goals', icon: CheckSquare, label: 'Daily Goals' },
        { to: '/analytics', icon: BarChart3, label: 'Analytics' },
        { to: '/admin/emails', icon: Mail, label: 'Email Logs' }
    ];

    return (
        <nav className="fixed left-0 top-0 h-full w-20 md:w-72 bg-dark-950/80 border-r border-white/5 z-50 flex flex-col items-center md:items-stretch py-6 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center gap-4 px-4 md:px-6 mb-8 group cursor-pointer">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-primary-500/30 group-hover:scale-105 transition-transform duration-500">
                    <BrainCircuit className="text-white w-6 h-6" />
                </div>
                <div className="hidden md:block">
                    <h1 className="text-lg font-black tracking-tight text-white">LEARNFAST</h1>
                    <p className="text-[10px] uppercase tracking-[0.3em] text-primary-300 font-bold opacity-70">Core</p>
                </div>
            </div>

            <div className="flex-1 px-3 md:px-4 space-y-1.5 font-sans">
                {navItems.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) => cn(
                            "relative flex items-center gap-3 px-3 md:px-4 py-3 rounded-2xl transition-all duration-300 group overflow-hidden border",
                            isActive
                                ? "bg-white/5 text-white border-white/10 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]"
                                : "text-dark-400 hover:text-white hover:bg-white/[0.04] border-transparent"
                        )}
                    >
                        {({ isActive }) => (
                            <>
                                {isActive && (
                                    <motion.div
                                        layoutId="nav-glow"
                                        className="absolute left-0 w-1 h-7 bg-primary-500 rounded-r-full shadow-[0_0_18px_rgba(139,92,246,0.85)]"
                                    />
                                )}
                                <div className={cn(
                                    "w-9 h-9 rounded-xl flex items-center justify-center transition-all",
                                    isActive ? "bg-primary-500/20 text-primary-300" : "bg-white/5 text-dark-500 group-hover:text-white"
                                )}>
                                    <item.icon className="w-4.5 h-4.5" />
                                </div>
                                <span className={cn(
                                    "hidden md:block font-semibold tracking-tight text-sm",
                                    isActive ? "text-white" : "text-dark-300 group-hover:text-white"
                                )}>
                                    {item.label}
                                </span>
                            </>
                        )}
                    </NavLink>
                ))}
            </div>

            <div className="px-3 md:px-4 mt-auto space-y-3">
                <FocusStatus />
                <button
                    onClick={onOpenSettings}
                    className="flex items-center gap-3 px-3 md:px-4 py-3 rounded-2xl text-dark-400 hover:text-white hover:bg-white/[0.04] border border-transparent w-full transition-all group cursor-pointer"
                >
                    <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors">
                        <Settings className="w-4.5 h-4.5 group-hover:rotate-90 transition-transform duration-700" />
                    </div>
                    <span className="hidden md:block font-semibold tracking-tight text-sm">Global Settings</span>
                </button>
            </div>
        </nav>
    );
};

export default Navbar;
