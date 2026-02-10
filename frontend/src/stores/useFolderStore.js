import { create } from 'zustand';
import api from '../services/api';

/**
 * Store for managing folders and selection state.
 *
 * @typedef {Object} FolderStore
 * @property {Array} folders - List of all folders.
 * @property {string|null} selectedFolderId - Currently selected folder ID.
 * @property {boolean} isLoading - Loading state.
 * @property {Error|null} error - Error state.
 */
const useFolderStore = create((set, get) => ({
    folders: [],
    selectedFolderId: null,
    isLoading: false,
    error: null,

    fetchFolders: async () => {
        set({ isLoading: true, error: null });
        try {
            const data = await api.get('/folders');
            set({ folders: data, isLoading: false });
        } catch (err) {
            set({ error: err, isLoading: false });
        }
    },

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

    deleteFolder: async (id) => {
        try {
            await api.delete(`/folders/${id}`);
            set((state) => ({
                folders: state.folders.filter((f) => f.id !== id),
                selectedFolderId: state.selectedFolderId === id ? null : state.selectedFolderId,
            }));
        } catch (err) {
            set({ error: err });
        }
    },

    setSelectedFolder: (folderId) => {
        set({ selectedFolderId: folderId });
    }
}));

export default useFolderStore;
