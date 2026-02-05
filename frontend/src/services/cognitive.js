import api from './api';

/**
 * Service for Cognitive/Metacognitive features.
 */

const getOverview = async (userId = 'default_user') => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return api.get(`/cognitive/overview?user_id=${userId}&timezone=${timezone}`);
};

const getRecommendation = async () => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return api.get(`/cognitive/recommendation?timezone=${timezone}`);
};

const getStability = async () => {
    return api.get('/cognitive/stability');
};

const getFrontier = async (userId = 'default_user') => {
    return api.get(`/cognitive/frontier?user_id=${userId}`);
};

const getGaps = async () => {
    return [];
};

/**
 * Fetches user's learning calibration settings from the backend.
 */
const getSettings = async (userId = 'default_user') => {
    return api.get(`/cognitive/settings?user_id=${userId}`);
};

/**
 * Updates user's learning calibration settings.
 */
const updateSettings = async (settings, userId = 'default_user') => {
    return api.post(`/cognitive/settings?user_id=${userId}`, settings);
};

export default {
    getOverview,
    getRecommendation,
    getStability,
    getFrontier,
    getGaps,
    getSettings,
    updateSettings
};
