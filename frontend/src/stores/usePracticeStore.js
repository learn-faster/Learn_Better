import { create } from "zustand";
import practiceService from "../services/practice";

const usePracticeStore = create((set, get) => ({
    sessionId: null,
    items: [],
    sourceMix: {},
    targetDuration: 0,
    currentIndex: 0,
    summary: null,
    history: [],
    isLoading: false,
    error: null,

    startSession: async (payload) => {
        set({ isLoading: true, error: null, summary: null });
        try {
            const data = await practiceService.createSession(payload);
            set({
                sessionId: data.session_id,
                items: data.items || [],
                sourceMix: data.source_mix || {},
                targetDuration: data.target_duration_minutes || 0,
                currentIndex: 0,
                isLoading: false,
            });
            return data;
        } catch (err) {
            set({ error: err, isLoading: false });
            throw err;
        }
    },

    submitItem: async (payload) => {
        const { sessionId } = get();
        if (!sessionId) return null;
        try {
            const result = await practiceService.submitItem(sessionId, payload);
            return result;
        } catch (err) {
            set({ error: err });
            throw err;
        }
    },

    advanceItem: () => {
        const { currentIndex, items } = get();
        if (currentIndex < items.length - 1) {
            set({ currentIndex: currentIndex + 1 });
        }
    },

    endSession: async (payload) => {
        const { sessionId } = get();
        if (!sessionId) return null;
        set({ isLoading: true, error: null });
        try {
            const summary = await practiceService.endSession(sessionId, payload);
            set({ summary, isLoading: false });
            return summary;
        } catch (err) {
            set({ error: err, isLoading: false });
            throw err;
        }
    },

    fetchHistory: async (limit = 8) => {
        try {
            const data = await practiceService.getHistory(limit);
            set({ history: data.items || [] });
            return data.items || [];
        } catch (err) {
            set({ error: err });
            return [];
        }
    },

    resetSession: () => set({ sessionId: null, items: [], sourceMix: {}, targetDuration: 0, currentIndex: 0, summary: null }),
}));

export default usePracticeStore;
