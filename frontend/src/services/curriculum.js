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
 * Stubbed: Module content is now generated at curriculum creation time.
 * This can be used later for refreshing content.
 */
const generateModuleContent = async (moduleId) => {
    return { id: moduleId };
};

export default {
    generateCurriculum,
    getCurriculums,
    getCurriculum,
    updateCurriculum,
    toggleModule,
    generateModuleContent
};

