import api from './api';

/**
 * Service for managing active study sessions and SRS operations.
 */

/**
 * Starts a new, empty study session.
 * @async
 * @returns {Promise<Object>} The newly created session record.
 */
const startSession = async () => {
    return await api.post('/study/session');
};

/**
 * Submits a review result for a flashcard within a session.
 * @async
 * @param {string} sessionId - Active session ID.
 * @param {Object} reviewData - Result data (flashcard_id, rating, time_taken).
 * @returns {Promise<Object>} SRS update and next review date.
 */
const submitReview = async (sessionId, reviewData) => {
    return await api.post(`/study/session/${sessionId}/review`, reviewData);
};

/**
 * Finalizes an active session and computes aggregate stats.
 * @async
 * @param {string} sessionId - ID of the session to end.
 * @returns {Promise<Object>} Post-session summary statistics.
 */
const endSession = async (sessionId) => {
    return await api.post(`/study/session/${sessionId}/end`);
};

/**
 * Retrieves historical study sessions.
 * @async
 * @param {number} skip - Number of sessions to skip.
 * @param {number} limit - Max sessions to return.
 * @returns {Promise<Array>} List of study sessions.
 */
const getSessions = async (skip = 0, limit = 20) => {
    return await api.get(`/study/sessions?skip=${skip}&limit=${limit}`);
};

/**
 * Fetches upcoming review schedule.
 * @async
 * @param {number} days - Number of days to look ahead.
 * @returns {Promise<Object>} Schedule mapping dates to flashcards.
 */
const getUpcomingReviews = async (days = 7) => {
    return await api.get(`/study/upcoming?days=${days}`);
};

export default {
    startSession,
    submitReview,
    endSession,
    getSessions,
    getUpcomingReviews
};
