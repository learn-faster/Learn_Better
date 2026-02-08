import api from "./api";

const practiceService = {
    createSession: async (payload) => api.post("/practice/session", payload),
    submitItem: async (sessionId, payload) => api.post(`/practice/session/${sessionId}/item`, payload),
    endSession: async (sessionId, payload) => api.post(`/practice/session/${sessionId}/end`, payload),
    getHistory: async (limit = 10) => api.get("/practice/history", { params: { limit } }),
};

export default practiceService;
