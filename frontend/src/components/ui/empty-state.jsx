import React from 'react';
import { cn } from '@/lib/utils';

const EmptyState = ({ title, description, action, className }) => {
    return (
        <div className={cn('rounded-3xl border border-white/10 bg-dark-900/50 p-8 text-center', className)}>
            {title && <h3 className="text-lg font-black text-white">{title}</h3>}
            {description && <p className="mt-2 text-sm text-dark-300">{description}</p>}
            {action && <div className="mt-4 flex justify-center">{action}</div>}
        </div>
    );
};

export default EmptyState;
