import api from './api';

export const agentApi = {
  status: () => api.get('/goals/agent/status'),
  onboarding: (payload) => api.post('/goals/agent/onboarding', payload),
  chat: (payload) => api.post('/goals/agent/chat', payload),
  settings: () => api.get('/goals/agent/settings'),
  saveSettings: (payload) => api.post('/goals/agent/settings', payload),
  screenshot: (payload) => api.post('/goals/agent/tools/screenshot', payload),
  email: (payload) => api.post('/goals/agent/tools/email', payload),
  scratchpad: (payload) => api.post('/goals/agent/tools/scratchpad', payload),
  fitbitSummary: (params) => api.get('/fitbit/summary', { params }),
  fitbitRefresh: () => api.post('/fitbit/refresh'),
  history: () => api.get('/goals/agent/history'),
  negotiateSummary: () => api.get('/goals/agent/negotiation-summary'),
  emailLogs: (params) => api.get('/goals/agent/email/logs', { params }),
  saveDailyPlanEntry: (payload) => api.post('/goals/daily-plan/entries', payload)
};
