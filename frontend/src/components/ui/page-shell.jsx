import React from 'react';
import { cn } from '@/lib/utils';

const PageShell = ({ className, children }) => (
    <div className={cn('relative z-10 space-y-8 pb-16', className)}>
        {children}
    </div>
);

export default PageShell;
