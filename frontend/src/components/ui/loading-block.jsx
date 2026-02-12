import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const LoadingBlock = ({ label = 'Loading...', className }) => (
    <div className={cn('flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-dark-900/50 p-6', className)}>
        <Loader2 className="h-4 w-4 animate-spin text-primary-400" />
        <span className="text-xs uppercase tracking-widest text-dark-400 font-semibold">{label}</span>
    </div>
);

export default LoadingBlock;
