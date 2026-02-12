import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

const ErrorCallout = ({ message, className }) => {
    if (!message) return null;
    return (
        <div className={cn('flex items-start gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-100', className)}>
            <AlertTriangle className="h-4 w-4 mt-0.5 text-rose-300" />
            <div className="text-sm">{message}</div>
        </div>
    );
};

export default ErrorCallout;
