import api from './api';

/**
 * Service for Cognitive/Metacognitive features.
 * NOTE: Backend endpoints for this feature are not yet implemented.
 * All functions return mock data until backend support is added.
 */

const STUB_MESSAGE = 'Cognitive features are not yet available in the backend.';

/**
 * @stub Returns mock recommendation data.
 */
const getRecommendation = async () => {
    console.warn(STUB_MESSAGE);
    return {
        current_phase: 'focus',
        phase_name: 'Deep Focus',
        next_phase: 'break',
        next_phase_in: 25,
        message: 'Backend cognitive endpoints not available'
    };
};

/**
 * @stub Returns empty gaps list.
 */
const getGaps = async () => {
    console.warn(STUB_MESSAGE);
    return [];
};

/**
 * @stub No-op for logging gaps.
 */
const logGap = async (gapData) => {
    console.warn(STUB_MESSAGE);
    return { id: 'stub', ...gapData };
};

/**
 * @stub No-op for resolving gaps.
 */
const resolveGap = async (gapId) => {
    console.warn(STUB_MESSAGE);
    return { success: true };
};

/**
 * @stub Returns default settings.
 */
const getSettings = async () => {
    console.warn(STUB_MESSAGE);
    return {
        chronotype: 'intermediate',
        use_fsrs: false,
        focus_duration: 25,
        break_duration: 5
    };
};

/**
 * @stub No-op for updating settings.
 */
const updateSettings = async (settings) => {
    console.warn(STUB_MESSAGE);
    return settings;
};

export default {
    getRecommendation,
    getGaps,
    logGap,
    resolveGap,
    getSettings,
    updateSettings
};
