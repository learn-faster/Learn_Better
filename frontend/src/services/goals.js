import api from './api';

/**
 * Goals Service
 * 
 * Handles all goal-related API operations including CRUD and focus sessions.
 */
const goalsService = {
    /**
     * Get all goals for the current user.
     * @param {Object} filters - Optional filters { status, domain }
     * @returns {Promise<Array>} List of goals
     */
    async getGoals(filters = {}) {
        const params = new URLSearchParams();
        if (filters.status) params.append('status', filters.status);
        if (filters.domain) params.append('domain', filters.domain);
        const queryString = params.toString();
        return api.get(`/goals/${queryString ? '?' + queryString : ''}`);
    },

    /**
     * Get a single goal by ID.
     * @param {string} goalId 
     * @returns {Promise<Object>} Goal object
     */
    async getGoal(goalId) {
        return api.get(`/goals/${goalId}`);
    },

    /**
     * Create a new goal.
     * @param {Object} goalData - { title, description, domain, target_hours, deadline, priority }
     * @returns {Promise<Object>} Created goal
     */
    async createGoal(goalData) {
        return api.post('/goals/', goalData);
    },

    /**
     * Update a goal.
     * @param {string} goalId 
     * @param {Object} updates 
     * @returns {Promise<Object>} Updated goal
     */
    async updateGoal(goalId, updates) {
        return api.patch(`/goals/${goalId}`, updates);
    },

    /**
     * Delete a goal.
     * @param {string} goalId 
     * @returns {Promise<void>}
     */
    async deleteGoal(goalId) {
        return api.delete(`/goals/${goalId}`);
    },

    /**
     * Start a focus session for a goal.
     * @param {string} goalId - Goal ID (use 'none' for no goal)
     * @param {Object} sessionData - { session_type }
     * @returns {Promise<Object>} Created session
     */
    async startFocusSession(goalId, sessionData = {}) {
        return api.post(`/goals/${goalId}/sessions`, sessionData);
    },

    /**
     * End a focus session and log time.
     * @param {string} sessionId 
     * @param {Object} endData - { duration_minutes, notes }
     * @returns {Promise<Object>} Updated session
     */
    async endFocusSession(sessionId, endData) {
        return api.post(`/goals/sessions/${sessionId}/end`, endData);
    },

    /**
     * Get focus sessions for a goal.
     * @param {string} goalId 
     * @param {number} limit 
     * @returns {Promise<Array>} List of sessions
     */
    async getGoalSessions(goalId, limit = 20) {
        return api.get(`/goals/${goalId}/sessions?limit=${limit}`);
    }
};

export default goalsService;
