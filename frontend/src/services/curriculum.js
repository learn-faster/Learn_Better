import api from './api';
import { getUserId } from '../lib/utils/user-id';

/**
 * Service for managing Curriculums.
 */

/**
 * Generates a new curriculum from a goal and document(s).
 */
const generateCurriculum = async (payload) => {
    return api.post('/curriculum/generate', {
        title: payload.title,
        document_ids: payload.document_ids || [],
        user_id: payload.user_id || getUserId(),
        time_budget_hours_per_week: payload.time_budget_hours_per_week || 5,
        duration_weeks: payload.duration_weeks || 4,
        start_date: payload.start_date || null,
        llm_enhance: payload.llm_enhance || false,
        llm_config: payload.llm_config || null
    });
};

/**
 * Fetches all curriculums for the user.
 */
const getCurriculums = async () => {
    return api.get('/curriculum/', {
        params: { user_id: getUserId() }
    });
};

/**
 * Fetches a single curriculum by ID.
 */
const getCurriculum = async (id) => {
    return api.get(`/curriculum/${id}`);
};

const getTimeline = async (id) => {
    return api.get(`/curriculum/${id}/timeline`);
};

const getMetrics = async (id) => {
    return api.get(`/curriculum/${id}/metrics`);
};

const toggleTask = async (taskId) => {
    return api.post(`/curriculum/task/${taskId}/toggle`);
};

const getWeekReport = async (weekId) => {
    return api.get(`/curriculum/week/${weekId}/report`);
};

const startCheckpointRecall = async (checkpointId) => {
    return api.post(`/curriculum/checkpoint/${checkpointId}/start-recall`);
};

const completeCheckpoint = async (checkpointId) => {
    return api.post(`/curriculum/checkpoint/${checkpointId}/complete`);
};

const replanCurriculum = async (id) => {
    return api.post(`/curriculum/${id}/replan`);
};

/**
 * Stubbed: Curriculums are mostly immutable for now or updated via modules.
 */
const updateCurriculum = async (id, data) => {
    return data;
};

/**
 * Toggles a module's completion status.
 */
const toggleModule = async (curriculumId, moduleId) => {
    return api.post(`/curriculum/module/${moduleId}/toggle`);
};

/**
 * Generates/refreshes module content.
 */
const generateModuleContent = async (curriculumId, moduleId) => {
    return api.post(`/curriculum/module/${moduleId}/generate`);
};

/**
 * Deletes a module.
 */
const deleteModule = async (moduleId) => {
    return api.delete(`/curriculum/module/${moduleId}`);
};

/**
 * Deletes a curriculum.
 */
const deleteCurriculum = async (id) => {
    return api.delete(`/curriculum/${id}`);
};

export default {
    generateCurriculum,
    getCurriculums,
    getCurriculum,
    updateCurriculum,
    toggleModule,
    generateModuleContent,
    deleteModule,
    deleteCurriculum,
    getTimeline,
    getMetrics,
    toggleTask,
    getWeekReport,
    startCheckpointRecall,
    completeCheckpoint,
    replanCurriculum
};

