import { create } from 'zustand';
import api from '../services/api';
import useFolderStore from './useFolderStore';

/**
 * Store for managing documents.
 * Handles fetching, creating, updating, and deleting documents.
 * 
 * @typedef {Object} DocumentStore
 * @property {Array} documents - List of all documents.
 * @property {boolean} isLoading - Loading state for async operations.
 * @property {Error|null} error - Error state for failed requests.
 */
const useDocumentStore = create((set, get) => ({
    documents: [],
    isLoading: false,
    error: null,
    lastFetchedAt: 0,

    /**
     * Moves a document to a different folder.
     * @async
     * @param {string} documentId - The document ID.
     * @param {string|null} folderId - The destination folder ID.
     */
    moveToFolder: async (documentId, folderId) => {
        try {
            await api.put(`/documents/${documentId}/move`, { folder_id: folderId });
            set((state) => ({
                documents: state.documents.map((doc) =>
                    doc.id === documentId ? { ...doc, folder_id: folderId } : doc
                ),
            }));
            // Refresh folders to update counts
            useFolderStore.getState().fetchFolders();
        } catch (err) {
            set({ error: err });
        }
    },

    /**
     * Fetches all documents from the backend.
     * @async
     */
    fetchDocuments: async (silent = false, options = {}) => {
        const { minIntervalMs = 3000, force = false, timeout = 20000 } = options || {};
        const now = Date.now();
        const lastFetchedAt = get().lastFetchedAt || 0;
        if (!force && now - lastFetchedAt < minIntervalMs) {
            return;
        }
        if (!silent) set({ isLoading: true, error: null });

        // Use AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const data = await api.get('/documents', {
                signal: controller.signal,
                headers: silent ? { 'X-Silent-Error': 'true' } : {}
            });
            clearTimeout(timeoutId);

            const optimistic = get().documents.filter((doc) => {
                if (!doc.isOptimistic) return false;
                return !data.some((serverDoc) => {
                    const serverTitle = serverDoc.title || serverDoc.filename || '';
                    return serverTitle && serverTitle === doc.title;
                });
            });
            if (!silent) {
                set({ documents: [...optimistic, ...data], isLoading: false, lastFetchedAt: now });
            } else {
                set({ documents: [...optimistic, ...data], lastFetchedAt: now });
            }
        } catch (err) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError' || err.code === 'ECONNABORTED') {
                const timeoutErr = new Error('Request timed out. The server may be under heavy load.');
                timeoutErr.userMessage = timeoutErr.message;
                set({ error: timeoutErr, isLoading: false });
            } else {
                set({ error: err, isLoading: false });
            }
        }
    },

    setDocumentsFromSocket: (docs) => {
        if (!Array.isArray(docs)) return;
        set({ documents: docs, lastFetchedAt: Date.now() });
    },

    /**
     * Uploads a new document file.
     * @async
     * @param {FormData} formData - The multipart form data containing the file/metadata.
     * @returns {Promise<Object>} The created document record.
     */
    uploadDocument: async (formData) => {
        set({ error: null }); // Don't set global isLoading to true, it might flicker the list

        // 1. Optimistic Update
        const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const file = formData.get('file');
        const optimisticDoc = {
            id: tempId,
            title: formData.get('title') || 'New Document',
            status: 'uploading', // Custom status for UI
            reading_progress: 0,
            file_type: file?.type?.includes('pdf') ? 'pdf' : 'other',
            folder_id: formData.get('folder_id'),
            created_at: new Date().toISOString(),
            isOptimistic: true
        };

        set((state) => ({
            documents: [optimisticDoc, ...state.documents]
        }));

        try {
            const newDoc = await api.post('/documents/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });

            // 2. Replace Optimistic with Real
            set((state) => ({
                documents: state.documents.map(d => d.id === tempId ? newDoc : d),
            }));

            // Refresh folders to update counts
            useFolderStore.getState().fetchFolders();
            return newDoc;
        } catch (err) {
            // 3. Rollback on Error
            set((state) => ({
                documents: state.documents.filter(d => d.id !== tempId),
                error: err
            }));
            throw err;
        }
    },

    /**
     * Adds a new external link as a document.
     * @async
     * @param {Object} linkData - The link metadata (url, title, folder_id, tags).
     * @returns {Promise<Object>} The created document record.
     */
    addLinkDocument: async (linkData) => {
        set({ isLoading: true, error: null });
        try {
            const newDoc = await api.post('/documents/link', linkData);
            set((state) => ({
                documents: [newDoc, ...state.documents],
                isLoading: false,
            }));
            // Refresh folders to update counts
            useFolderStore.getState().fetchFolders();
            return newDoc;
        } catch (err) {
            set({ error: err, isLoading: false });
            throw err;
        }
    },

    /**
     * Deletes a document.
     * @async
     * @param {string} id - The document ID.
     */
    deleteDocument: async (id, options = {}) => {
        try {
            const params = options?.removeGraphLinks ? { remove_graph_links: true } : undefined;
            await api.delete(`/documents/${id}`, { params });
            set((state) => ({
                documents: state.documents.filter((doc) => doc.id !== id),
            }));
            // Refresh folders to update counts
            useFolderStore.getState().fetchFolders();
        } catch (err) {
            set({ error: err });
            throw err;
        }
    },

    /**
     * Updates document metadata (title, tags, etc).
     * @async
     * @param {string} id - The document ID.
     * @param {Object} data - The updated properties.
     * @returns {Promise<Object>} The updated document record.
     */
    updateDocument: async (id, data) => {
        try {
            const updatedDoc = await api.put(`/documents/${id}`, data);
            set((state) => ({
                documents: state.documents.map((doc) => (doc.id === id ? updatedDoc : doc)),
            }));
            return updatedDoc;
        } catch (err) {
            set({ error: err });
        }
    },

    /**
     * Triggers the knowledge graph synthesis for a document.
     * @async
     * @param {string} id - The document ID.
     */
    synthesizeDocument: async (id, options = {}) => {
        // Optimistic update
        set((state) => ({
            documents: state.documents.map(d =>
                d.id === id ? { ...d, status: 'ingesting', ingestion_step: 'queued' } : d
            )
        }));

        try {
            const resume = options?.resume;
            const params = typeof resume === 'boolean' ? { resume } : undefined;
            await api.post(`/documents/${id}/synthesize`, null, params ? { params } : undefined);
            // No need to fetch immediately, the optimistic update holds it until polling takes over
        } catch (err) {
            console.error("Failed to start synthesis:", err);
            // Revert on failure
            set((state) => ({
                documents: state.documents.map(d =>
                    d.id === id ? { ...d, status: 'extracted' } : d
                ),
                error: err
            }));
            throw err;
        }
    },

    /**
     * Triggers text re-extraction (Phase 1) for a document.
     * Useful when extraction failed or returned empty text.
     * @async
     * @param {string} id - The document ID.
     */
    reprocessDocument: async (id) => {
        // Optimistic update
        set((state) => ({
            documents: state.documents.map(d =>
                d.id === id ? { ...d, status: 'processing', ingestion_step: 'queued_extraction' } : d
            )
        }));

        try {
            await api.post(`/documents/${id}/reprocess`);
            // Polling will update the status
        } catch (err) {
            console.error("Failed to start reprocessing:", err);
            set((state) => ({
                documents: state.documents.map(d =>
                    d.id === id ? { ...d, status: 'failed' } : d
                ),
                error: err
            }));
            throw err;
        }
    },
}));

export default useDocumentStore;
