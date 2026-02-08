import { create } from 'zustand';
import api from '../services/api';

/**
 * Store for managing the flashcard library and due reviews.
 * 
 * @typedef {Object} FlashcardStore
 * @property {Array} flashcards - All flashcards in the library.
 * @property {Array} dueCards - Flashcards currently due for review.
 * @property {boolean} isLoading - Loading state for async operations.
 * @property {Error|null} error - Error state if an operation fails.
 */
const useFlashcardStore = create((set, get) => ({
    flashcards: [],
    dueCards: [],
    isLoading: false,
    error: null,

    /**
     * Fetches flashcards from the backend with optional filtering.
     * @async
     * @param {Object} [params={}] - Filter parameters (document_id, tag).
     */
    fetchFlashcards: async (params = {}) => {
        set({ isLoading: true, error: null });
        try {
            const data = await api.get('/flashcards', { params });
            set({ flashcards: data, isLoading: false });
        } catch (err) {
            set({ error: err, isLoading: false });
        }
    },

    /**
     * Retrieves all flashcards that are due for review according to SRS.
     * @async
     * @returns {Promise<Array>} The list of due cards.
     */
    fetchDueCards: async (params = {}) => {
        set({ isLoading: true, error: null });
        try {
            const data = await api.get('/flashcards/due', { params });
            set({ dueCards: data, isLoading: false });
            return data;
        } catch (err) {
            set({ error: err, isLoading: false });
        }
    },

    /**
     * Persists a new flashcard to the database.
     * @async
     * @param {Object} cardData - The flashcard content (front, back, tags).
     * @returns {Promise<Object>} The created flashcard record.
     */
    createFlashcard: async (cardData) => {
        set({ isLoading: true, error: null });
        try {
            const newCard = await api.post('/flashcards', cardData);
            set((state) => ({
                flashcards: [newCard, ...state.flashcards],
                isLoading: false,
            }));
            return newCard;
        } catch (err) {
            set({ error: err, isLoading: false });
            throw err;
        }
    },

    /**
     * Deletes a flashcard by ID.
     * @async
     * @param {string} id - UUID of the flashcard.
     */
    deleteFlashcard: async (id) => {
        try {
            await api.delete(`/flashcards/${id}`);
            set((state) => ({
                flashcards: state.flashcards.filter((card) => card.id !== id),
                dueCards: state.dueCards.filter((card) => card.id !== id),
            }));
        } catch (err) {
            set({ error: err });
        }
    },

    /**
     * Updates an existing flashcard's content.
     * @async
     * @param {string} id - UUID of the flashcard.
     * @param {Object} data - Updated fields (front, back, tags).
     * @returns {Promise<Object>} The updated flashcard record.
     */
    updateFlashcard: async (id, data) => {
        try {
            const updatedCard = await api.put(`/flashcards/${id}`, data);
            set((state) => ({
                flashcards: state.flashcards.map((card) => (card.id === id ? updatedCard : card)),
                dueCards: state.dueCards.map((card) => (card.id === id ? updatedCard : card)),
            }));
            return updatedCard;
        } catch (err) {
            set({ error: err });
        }
    },
}));

export default useFlashcardStore;
