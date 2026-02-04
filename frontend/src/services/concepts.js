import api from './api';

/**
 * Service for Knowledge Graph / Concept Mapping.
 * Uses the navigation router endpoints from the backend.
 */
const ConceptService = {
    /**
     * Fetches root concepts (concepts with no prerequisites).
     * @returns {Promise<Array>} List of root concept names.
     */
    getRoots: async () => {
        return await api.get('/concepts/roots');
    },

    /**
     * Fetches unlocked concepts for a specific user.
     * @param {string} userId - The user ID.
     * @returns {Promise<Array>} List of unlocked concept names.
     */
    getUnlockedConcepts: async (userId) => {
        return await api.get(`/concepts/unlocked/${userId}`);
    },

    /**
     * Fetches user progress including completed, in-progress, and available concepts.
     * @param {string} userId - The user ID.
     * @returns {Promise<Object>} User state object.
     */
    getUserProgress: async (userId) => {
        return await api.get(`/progress/${userId}`);
    },

    /**
     * Fetches the full concept graph structure (nodes and edges).
     * @returns {Promise<Object>} Graph data { nodes: [], edges: [] }
     */
    getGraph: async () => {
        return await api.get('/concepts/graph');
    },

    /**
     * @stub No backend endpoint for concept extraction.
     */
    extractConcepts: async (documentId) => {
        console.warn('Concept extraction endpoint not available in backend.');
        return { nodes: [], edges: [], message: 'Not implemented' };
    },

    /**
     * @stub No backend endpoint for document-specific graph.
     */
    getDocumentGraph: async (documentId) => {
        console.warn('Document graph endpoint not available in backend.');
        return { nodes: [], edges: [], message: 'Not implemented' };
    }
};

export default ConceptService;
