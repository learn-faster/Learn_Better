import api from './api';
import { getUserId } from '../lib/utils/user-id';

const GraphService = {
    listGraphs: async (userId = getUserId()) => {
        return await api.get(`/graphs?user_id=${encodeURIComponent(userId)}`);
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
    buildGraph: async (graphId, payload) => {
        return await api.post(`/graphs/${graphId}/build`, payload);
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
