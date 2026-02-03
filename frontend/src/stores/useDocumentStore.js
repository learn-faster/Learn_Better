import { create } from 'zustand';
import api from '../services/api';

/**
 * Store for managing documents and folders.
 * Handles fetching, creating, updating, and deleting documents and folders,
 * as well as managing the global selection state for the sidebar.
 * 
 * @typedef {Object} DocumentStore
 * @property {Array} documents - List of all documents.
 * @property {Array} folders - List of all folders.
 * @property {string|null} selectedFolderId - The currently selected folder ID (null for 'All').
 * @property {boolean} isLoading - Loading state for async operations.
 * @property {Error|null} error - Error state for failed requests.
 */
const useDocumentStore = create((set, get) => ({
    documents: [],
    folders: [],
    selectedFolderId: null,  // null = "All Documents"
    isLoading: false,
    error: null,

    /**
     * Fetches all folders from the backend.
     * @async
     */
    fetchFolders: async () => {
        try {
            const data = await api.get('/folders');
            set({ folders: data });
        } catch (err) {
            set({ error: err });
        }
    },

    /**
     * Creates a new folder.
     * @async
     * @param {Object} folderData - The folder to create (name, color, icon).
     * @returns {Promise<Object>} The created folder object.
     */
    createFolder: async (folderData) => {
        try {
            const newFolder = await api.post('/folders', folderData);
            set((state) => ({
                folders: [...state.folders, newFolder],
            }));
            return newFolder;
        } catch (err) {
            set({ error: err });
            throw err;
        }
    },

    /**
     * Updates an existing folder.
     * @async
     * @param {string} id - The folder ID.
     * @param {Object} data - The updated folder properties.
     * @returns {Promise<Object>} The updated folder object.
     */
    updateFolder: async (id, data) => {
        try {
            const updated = await api.put(`/folders/${id}`, data);
            set((state) => ({
                folders: state.folders.map((f) => (f.id === id ? updated : f)),
            }));
            return updated;
        } catch (err) {
            set({ error: err });
        }
    },

    /**
     * Deletes a folder and refreshes the document list.
     * @async
     * @param {string} id - The folder ID.
     */
    deleteFolder: async (id) => {
        try {
            await api.delete(`/folders/${id}`);
            set((state) => ({
                folders: state.folders.filter((f) => f.id !== id),
                selectedFolderId: state.selectedFolderId === id ? null : state.selectedFolderId,
            }));
            // Refresh documents since they may have been unfiled
            get().fetchDocuments();
        } catch (err) {
            set({ error: err });
        }
    },

    /**
     * Sets the currently active folder in the UI.
     * @param {string|null} folderId - The folder ID or null for 'All'.
     */
    setSelectedFolder: (folderId) => {
        set({ selectedFolderId: folderId });
    },

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
            get().fetchFolders();
        } catch (err) {
            set({ error: err });
        }
    },

    /**
     * Fetches all documents from the backend.
     * @async
     */
    fetchDocuments: async () => {
        set({ isLoading: true, error: null });
        try {
            const data = await api.get('/documents');
            set({ documents: data, isLoading: false });
        } catch (err) {
            set({ error: err, isLoading: false });
        }
    },

    /**
     * Uploads a new document file.
     * @async
     * @param {FormData} formData - The multipart form data containing the file/metadata.
     * @returns {Promise<Object>} The created document record.
     */
    /**
     * Uploads a new document file.
     * @async
     * @param {FormData} formData - The multipart form data containing the file/metadata.
     * @returns {Promise<Object>} The created document record.
     */
    uploadDocument: async (formData) => {
        set({ error: null }); // Don't set global isLoading to true, it might flicker the list

        // 1. Optimistic Update
        const tempId = `temp-${Date.now()}`;
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
            get().fetchFolders();
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
            get().fetchFolders();
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
    deleteDocument: async (id) => {
        try {
            await api.delete(`/documents/${id}`);
            set((state) => ({
                documents: state.documents.filter((doc) => doc.id !== id),
            }));
            // Refresh folders to update counts
            get().fetchFolders();
        } catch (err) {
            set({ error: err });
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
}));

export default useDocumentStore;
