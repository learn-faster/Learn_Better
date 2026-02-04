import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility for merging Tailwind classes with proper conflict resolution.
 * @param  {...any} inputs - Class names or arrays/objects of classes.
 * @returns {string} The merged class string.
 */
function cn(...inputs) {
    return twMerge(clsx(inputs));
}

/**
 * Reusable Premium Card Component.
 * 
 * Provides a standardized container with optional header, icon, and action slots.
 * Follows the 'glass' and 'premium' aesthetic of the application.
 * 
 * @param {Object} props - Component properties.
 * @param {React.ReactNode} props.children - Interior content of the card.
 * @param {string} [props.className] - Additional CSS classes.
 * @param {string} [props.title] - Bold header text.
 * @param {string} [props.subtitle] - Muted secondary text.
 * @param {React.ElementType} [props.icon] - Lucide icon component.
 * @param {React.ReactNode} [props.action] - Component/Button to display on the right side of the header.
 * @returns {JSX.Element} The rendered card component.
 */
const Card = ({ children, className, title, subtitle, icon: Icon, action }) => {
    return (
        <div className={cn("card-premium", className)}>
            {(title || Icon || action) && (
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        {Icon && (
                            <div className="w-10 h-10 rounded-xl bg-primary-500/10 flex items-center justify-center border border-primary-500/20">
                                <Icon className="w-5 h-5 text-primary-400" />
                            </div>
                        )}
                        <div>
                            {title && <h3 className="text-lg font-bold text-white tracking-tight">{title}</h3>}
                            {subtitle && <p className="text-sm text-dark-400">{subtitle}</p>}
                        </div>
                    </div>
                    {action && <div>{action}</div>}
                </div>
            )}
            {children}
        </div>
    );
};

export default Card;
