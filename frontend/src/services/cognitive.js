import api from './api';

/**
 * Service for Cognitive/Metacognitive features.
 */

const getOverview = async () => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return api.get(`/cognitive/overview?timezone=${timezone}`);
};

const getRecommendation = async () => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return api.get(`/cognitive/recommendation?timezone=${timezone}`);
};

const getStability = async () => {
    return api.get('/cognitive/stability');
};

const getFrontier = async () => {
    return api.get('/cognitive/frontier');
};

const getGaps = async () => {
    return [];
};

/**
 * Fetches user's learning calibration settings from the backend.
 */
const getSettings = async () => {
    return api.get('/cognitive/settings');
};

/**
 * Updates user's learning calibration settings.
 */
const updateSettings = async (settings) => {
    return api.patch('/cognitive/settings', settings);
};

const checkEmbeddingHealth = async () => {
    return api.get('/cognitive/embedding-health', {
        headers: {
            'X-Silent-Error': '1'
        }
    });
};

const getEmbeddingDiagnostics = async () => {
    return api.get('/cognitive/embedding-diagnostics', {
        headers: {
            'X-Silent-Error': '1'
        }
    });
};

const checkLlmHealth = async () => {
    return api.get('/cognitive/llm-health', {
        headers: {
            'X-Silent-Error': '1'
        }
    });
};

const reindexEmbeddings = async (payload = {}) => {
    return api.post('/cognitive/reindex-embeddings', payload);
};

export default {
    getOverview,
    getRecommendation,
    getStability,
    getFrontier,
    getGaps,
    getSettings,
    updateSettings,
    checkEmbeddingHealth,
    getEmbeddingDiagnostics,
    checkLlmHealth,
    reindexEmbeddings
};
