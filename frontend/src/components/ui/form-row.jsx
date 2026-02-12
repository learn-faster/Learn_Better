import React from 'react';
import { cn } from '@/lib/utils';

const FormRow = ({ label, helper, error, children, className }) => {
    return (
        <div className={cn('space-y-2', className)}>
            {label && <div className="text-[10px] uppercase tracking-[0.2em] text-dark-400 font-semibold">{label}</div>}
            {children}
            {helper && <div className="text-[11px] text-dark-400">{helper}</div>}
            {error && <div className="text-[11px] text-rose-300">{error}</div>}
        </div>
    );
};

export default FormRow;
