import api from './api';

/**
 * Service for managing Curriculums.
 */

/**
 * Generates a new curriculum from a goal and document.
 */
const generateCurriculum = async (goal, documentId) => {
    return api.post('/curriculum/generate', {
        title: goal,
        document_id: documentId,
        user_id: 'default_user'
    });
};

/**
 * Fetches all curriculums for the user.
 */
const getCurriculums = async () => {
    return api.get('/curriculum/');
};

/**
 * Fetches a single curriculum by ID.
 */
const getCurriculum = async (id) => {
    return api.get(`/curriculum/${id}`);
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
    deleteCurriculum
};

