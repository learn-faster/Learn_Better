import api from './api';

const GraphService = {
    listGraphs: async () => {
        return await api.get('/graphs');
    },
    createGraph: async (payload) => {
        return await api.post('/graphs', payload);
    },
    updateGraph: async (graphId, payload) => {
        return await api.put(`/graphs/${graphId}`, payload);
    },
    deleteGraph: async (graphId) => {
        return await api.delete(`/graphs/${graphId}`);
    },
    buildGraph: async (graphId, payload, options = {}) => {
        const params = new URLSearchParams();
        if (typeof options.wait === 'boolean') params.set('wait', options.wait ? 'true' : 'false');
        if (typeof options.force === 'boolean') params.set('force', options.force ? 'true' : 'false');
        const suffix = params.toString() ? `?${params.toString()}` : '';
        return await api.post(`/graphs/${graphId}/build${suffix}`, payload);
    },
    getGraphData: async (graphId, includeConnections = true, targetGraphId = null) => {
        const params = new URLSearchParams();
        params.set('include_connections', includeConnections ? 'true' : 'false');
        if (targetGraphId) params.set('target_graph_id', targetGraphId);
        return await api.get(`/graphs/${graphId}/data?${params.toString()}`);
    },
    suggestConnections: async (graphId, payload) => {
        return await api.post(`/graphs/${graphId}/connections/suggest`, payload);
    },
    saveConnections: async (graphId, payload) => {
        return await api.post(`/graphs/${graphId}/connections`, payload);
    },
    getConnections: async (graphId, targetGraphId = null) => {
        const params = new URLSearchParams();
        if (targetGraphId) params.set('target_graph_id', targetGraphId);
        const suffix = params.toString() ? `?${params.toString()}` : '';
        return await api.get(`/graphs/${graphId}/connections${suffix}`);
    }
};

export default GraphService;
