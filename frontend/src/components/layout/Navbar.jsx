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
    Settings
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion } from 'framer-motion';

/**
 * Utility for merging Tailwind classes safely.
 */
function cn(...inputs) {
    return twMerge(clsx(inputs));
}

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


        { to: '/analytics', icon: BarChart3, label: 'Analytics' },
    ];

    return (
        <nav className="fixed left-0 top-0 h-full w-20 md:w-64 glass border-r border-white/5 z-50 flex flex-col items-center md:items-stretch py-8 shadow-2xl">
            <div className="flex items-center gap-4 px-6 mb-12 group cursor-pointer">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-lg shadow-primary-500/30 group-hover:scale-110 transition-transform duration-500">
                    <BrainCircuit className="text-white w-7 h-7" />
                </div>
                <div className="hidden md:block">
                    <h1 className="text-xl font-black tracking-tighter text-white">LEARNFAST</h1>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-primary-400 font-bold opacity-70">Core Engine</p>
                </div>
            </div>

            <div className="flex-1 px-4 space-y-1.5 font-sans">
                {navItems.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) => cn(
                            "relative flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all duration-300 group overflow-hidden",
                            isActive
                                ? "bg-white/5 text-white border border-white/10 shadow-inner"
                                : "text-dark-400 hover:text-white hover:bg-white/[0.03] border border-transparent"
                        )}
                    >
                        {({ isActive }) => (
                            <>
                                {isActive && (
                                    <motion.div
                                        layoutId="nav-glow"
                                        className="absolute left-0 w-1 h-6 bg-primary-500 rounded-r-full shadow-[0_0_15px_rgba(139,92,246,0.8)]"
                                    />
                                )}
                                <item.icon className={cn(
                                    "w-5 h-5 transition-all duration-300",
                                    isActive ? "text-primary-400 scale-110" : "text-dark-500 group-hover:text-dark-300"
                                )} />
                                <span className={cn(
                                    "hidden md:block font-bold tracking-tight text-sm transition-colors",
                                    isActive ? "text-white" : "text-dark-400 group-hover:text-dark-200"
                                )}>
                                    {item.label}
                                </span>
                            </>
                        )}
                    </NavLink>
                ))}
            </div>

            <div className="px-4 mt-auto">
                <button
                    onClick={onOpenSettings}
                    className="flex items-center gap-4 px-4 py-4 rounded-2xl text-dark-500 hover:text-white hover:bg-white/[0.03] border border-transparent w-full transition-all group cursor-pointer"
                >
                    <div className="w-5 h-5 flex items-center justify-center">
                        <Settings className="w-5 h-5 group-hover:rotate-90 transition-transform duration-700" />
                    </div>
                    <span className="hidden md:block font-bold tracking-tight text-sm">AI Configuration</span>
                </button>
            </div>
        </nav>
    );
};

export default Navbar;
