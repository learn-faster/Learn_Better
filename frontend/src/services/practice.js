import api from "./api";
import { getUserId } from "../lib/utils/user-id";

const practiceService = {
    createSession: async (payload) => api.post("/practice/session", {
        ...(payload || {}),
        user_id: payload?.user_id || getUserId()
    }),
    submitItem: async (sessionId, payload) => api.post(`/practice/session/${sessionId}/item`, payload),
    endSession: async (sessionId, payload) => api.post(`/practice/session/${sessionId}/end`, payload),
    getHistory: async (limit = 10) => api.get("/practice/history", {
        params: {
            limit,
            user_id: getUserId()
        }
    }),
};

export default practiceService;
