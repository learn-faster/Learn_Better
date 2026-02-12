import api from './api';

const DocumentMarkdownService = {
    getMarkdown: (documentId, params = {}) => api.get(`/documents/${documentId}/markdown`, { params }),
    saveMarkdown: (documentId, payload) => api.put(`/documents/${documentId}/markdown`, payload),
    highlightAction: (documentId, payload) => api.post(`/documents/${documentId}/highlight/action`, payload)
};

export default DocumentMarkdownService;
