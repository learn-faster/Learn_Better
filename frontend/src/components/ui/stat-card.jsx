import React from 'react';
import { cn } from '@/lib/utils';

const StatCard = ({ label, value, meta, icon: Icon, className }) => {
    return (
        <div className={cn('rounded-2xl border border-white/10 bg-dark-900/60 p-4', className)}>
            <div className="flex items-center justify-between">
                <div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-dark-400 font-semibold">{label}</div>
                    <div className="mt-2 text-2xl font-black text-white">{value}</div>
                    {meta && <div className="mt-1 text-xs text-dark-400">{meta}</div>}
                </div>
                {Icon && (
                    <div className="h-10 w-10 rounded-xl bg-primary-500/10 text-primary-300 flex items-center justify-center">
                        <Icon className="h-5 w-5" />
                    </div>
                )}
            </div>
        </div>
    );
};

export default StatCard;
