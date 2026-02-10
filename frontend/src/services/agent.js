import api from './api';
import { getUserId } from '../lib/utils/user-id';

export const agentApi = {
  status: () => api.get('/goals/agent/status', { params: { user_id: getUserId() } }),
  onboarding: (payload) => api.post('/goals/agent/onboarding', { ...payload, user_id: getUserId() }),
  chat: (payload) => api.post('/goals/agent/chat', { ...payload, user_id: getUserId() }),
  settings: () => api.get('/goals/agent/settings', { params: { user_id: getUserId() } }),
  saveSettings: (payload) => api.post('/goals/agent/settings', { ...payload, user_id: getUserId() }),
  screenshot: (payload) => api.post('/goals/agent/tools/screenshot', { ...payload, user_id: getUserId() }),
  email: (payload) => api.post('/goals/agent/tools/email', { ...payload, user_id: getUserId() }),
  scratchpad: (payload) => api.post('/goals/agent/tools/scratchpad', { ...payload, user_id: getUserId() }),
  fitbitSummary: (params) => api.get('/fitbit/summary', { params: { ...params, user_id: getUserId() } }),
  fitbitRefresh: () => api.post('/fitbit/refresh', { user_id: getUserId() }),
  history: () => api.get('/goals/agent/history', { params: { user_id: getUserId() } }),
  negotiateSummary: () => api.get('/goals/agent/negotiation-summary', { params: { user_id: getUserId() } }),
  emailLogs: (params) => api.get('/goals/agent/email/logs', { params: { ...params, user_id: getUserId() } }),
  saveDailyPlanEntry: (payload) => api.post('/goals/daily-plan/entries', { ...payload, user_id: getUserId() })
};
