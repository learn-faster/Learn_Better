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
    getUnlockedConcepts: async () => {
        return await api.get('/concepts/unlocked/default_user');
    },

    /**
     * Fetches user progress including completed, in-progress, and available concepts.
     * @param {string} userId - The user ID.
     * @returns {Promise<Object>} User state object.
     */
    getUserProgress: async () => {
        return await api.get('/progress/default_user');
    },

    /**
     * Fetches the full concept graph structure (nodes and edges).
     * @param {string} userId - Optional user ID for personalized status.
     * @returns {Promise<Object>} Graph data { nodes: [], edges: [] }
     */
    getGraph: async () => {
        return await api.get('/concepts/graph?user_id=default_user');
    },

    /**
     * Extracts core concepts and relationships from a document.
     */
    extractConcepts: async (documentId) => {
        return await api.post('/ai/extract-concepts', {
            document_id: documentId,
            count: 7 // Default concept count
        });
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
