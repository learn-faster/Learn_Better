import api from './api';

/**
 * Service for managing Curriculums.
 * NOTE: Backend endpoints for this feature are not yet implemented.
 * All functions return mock data until backend support is added.
 */

const STUB_MESSAGE = 'Curriculum features are not yet available in the backend.';

/**
 * @stub Returns mock curriculum generation response.
 */
const generateCurriculum = async (goal, documentId) => {
    console.warn(STUB_MESSAGE);
    return {
        id: 'stub-curriculum',
        goal: goal,
        document_id: documentId,
        modules: [],
        created_at: new Date().toISOString(),
        message: 'Backend curriculum endpoints not available'
    };
};

/**
 * @stub Returns empty curriculum list.
 */
const getCurriculums = async () => {
    console.warn(STUB_MESSAGE);
    return [];
};

/**
 * @stub Returns mock curriculum.
 */
const getCurriculum = async (id) => {
    console.warn(STUB_MESSAGE);
    return {
        id: id,
        goal: 'Stub Curriculum',
        modules: [],
        progress: 0,
        message: 'Backend curriculum endpoints not available'
    };
};

/**
 * @stub No-op for updating curriculum.
 */
const updateCurriculum = async (id, data) => {
    console.warn(STUB_MESSAGE);
    return { id, ...data };
};

/**
 * @stub No-op for toggling module.
 */
const toggleModule = async (curriculumId, moduleId) => {
    console.warn(STUB_MESSAGE);
    return { id: moduleId, completed: true };
};

/**
 * @stub No-op for generating module content.
 */
const generateModuleContent = async (moduleId) => {
    console.warn(STUB_MESSAGE);
    return { id: moduleId, content: 'Content generation not available' };
};

export default {
    generateCurriculum,
    getCurriculums,
    getCurriculum,
    updateCurriculum,
    toggleModule,
    generateModuleContent
};
