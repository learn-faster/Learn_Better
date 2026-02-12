import api from './api';

const DocumentQuizService = {
    getStudySettings: (documentId) => api.get(`/documents/${documentId}/study-settings`),
    saveStudySettings: (documentId, payload) => api.post(`/documents/${documentId}/study-settings`, payload),
    generateQuizItems: (documentId, payload) => api.post(`/documents/${documentId}/quiz/generate`, payload),
    createSession: (documentId, payload) => api.post(`/documents/${documentId}/quiz/session`, payload),
    getSession: (documentId, sessionId) => api.get(`/documents/${documentId}/quiz/session/${sessionId}`),
    gradeItem: (documentId, payload) => api.post(`/documents/${documentId}/quiz/grade`, payload),
    gradeBatch: (documentId, formData) => api.post(`/documents/${documentId}/quiz/grade-batch`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),
    previewExercises: (documentId, payload) => api.post(`/documents/${documentId}/exercises/preview`, payload),
    createExercises: (documentId, payload) => api.post(`/documents/${documentId}/exercises`, payload),
    getStats: (documentId) => api.get(`/documents/${documentId}/quiz/stats`),
    testLlm: (payload) => api.post('/ai/test-llm', payload)
};

export default DocumentQuizService;
