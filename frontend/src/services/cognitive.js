import api from './api';
import { getUserId } from '../lib/utils/user-id';

/**
 * Service for Cognitive/Metacognitive features.
 */

const getOverview = async (userId = getUserId()) => {
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

const getFrontier = async (userId = getUserId()) => {
    return api.get(`/cognitive/frontier?user_id=${userId}`);
};

const getGaps = async () => {
    return [];
};

/**
 * Fetches user's learning calibration settings from the backend.
 */
const getSettings = async (userId = getUserId()) => {
    return api.get(`/cognitive/settings?user_id=${userId}`);
};

/**
 * Updates user's learning calibration settings.
 */
const updateSettings = async (settings, userId = getUserId()) => {
    return api.patch(`/cognitive/settings?user_id=${userId}`, settings);
};

const checkEmbeddingHealth = async (userId = getUserId()) => {
    return api.get(`/cognitive/embedding-health?user_id=${userId}`, {
        headers: {
            'X-Silent-Error': '1'
        }
    });
};

const checkLlmHealth = async (userId = getUserId()) => {
    return api.get(`/cognitive/llm-health?user_id=${userId}`, {
        headers: {
            'X-Silent-Error': '1'
        }
    });
};

const reindexEmbeddings = async (payload = {}, userId = getUserId()) => {
    return api.post(`/cognitive/reindex-embeddings?user_id=${userId}`, payload);
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
    checkLlmHealth,
    reindexEmbeddings
};
