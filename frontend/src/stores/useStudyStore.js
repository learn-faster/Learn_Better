import { create } from 'zustand';
import api from '../services/api';

/**
 * Store for managing study sessions and spaced repetition (SRS).
 * Handles the start/end of sessions and review submissions.
 * 
 * @typedef {Object} StudyStore
 * @property {Object|null} currentSession - The active study session data.
 * @property {Object|null} sessionStats - Post-session summary statistics.
 * @property {boolean} isLoading - Loading state for session actions.
 * @property {Error|null} error - Error state for failed requests.
 */
const useStudyStore = create((set, get) => ({
    currentSession: null,
    sessionStats: null,
    isLoading: false,
    error: null,

    /**
     * Creates and starts a new study session.
     * @async
     * @returns {Promise<Object>} The started session object.
     */
    startSession: async () => {
        set({ isLoading: true, error: null });
        try {
            const session = await api.post('/study/session');
            set({ currentSession: session, isLoading: false });
            return session;
        } catch (err) {
            set({ error: err, isLoading: false });
        }
    },

    /**
     * Submits a flashcard review for the current session.
     * @async
     * @param {Object} reviewData - The review result (card ID + rating).
     * @returns {Promise<Object>} The SRS update results.
     */
    submitReview: async (reviewData) => {
        const { currentSession } = get();
        if (!currentSession) return;

        try {
            const result = await api.post(`/study/session/${currentSession.id}/review`, reviewData);
            return result;
        } catch (err) {
            set({ error: err });
            throw err;
        }
    },

    /**
     * Finalizes the current study session and calculates statistics.
     * @async
     * @returns {Promise<Object>} The session summary statistics.
     */
    endSession: async () => {
        const { currentSession } = get();
        if (!currentSession) return;

        set({ isLoading: true });
        try {
            const stats = await api.post(`/study/session/${currentSession.id}/end`);
            set({ currentSession: null, sessionStats: stats, isLoading: false });
            return stats;
        } catch (err) {
            set({ error: err, isLoading: false });
        }
    },

    /**
     * Retrieves upcoming reviews for a specific forecast window.
     * @async
     * @param {number} [days=7] - Number of days to forecast ahead.
     * @returns {Promise<Array>} List of flashcards due in the period.
     */
    fetchUpcomingReviews: async (days = 7) => {
        try {
            const data = await api.get('/study/upcoming', { params: { days } });
            return data;
        } catch (err) {
            set({ error: err });
        }
    },

    /**
     * Fetches a Socratic hint for a flashcard.
     * @async
     * @param {string} cardId - The ID of the flashcard.
     * @returns {Promise<string>} The hint text.
     */
    getHint: async (cardId) => {
        try {
            const data = await api.post(`/study/flashcard/${cardId}/hint`);
            return data.hint;
        } catch (err) {
            console.error("Failed to fetch hint", err);
            throw err;
        }
    },
}));

export default useStudyStore;
