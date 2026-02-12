import React from 'react';
import { cn } from '@/lib/utils';

const SectionHeader = ({ title, subtitle, actions, className, align = 'between' }) => {
    return (
        <div
            className={cn(
                'flex flex-col gap-3 sm:flex-row sm:items-end',
                align === 'between' ? 'sm:justify-between' : 'sm:justify-start',
                className
            )}
        >
            <div>
                {title && <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">{title}</h2>}
                {subtitle && <p className="mt-2 text-sm text-dark-300 max-w-2xl">{subtitle}</p>}
            </div>
            {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
    );
};

export default SectionHeader;
