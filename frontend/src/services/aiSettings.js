import api from './api';

const aiSettings = {
    get: async () => api.get('/settings/ai'),
    update: async (payload) => api.put('/settings/ai', payload)
};

export default aiSettings;
