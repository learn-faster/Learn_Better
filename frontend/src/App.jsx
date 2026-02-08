import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from './components/layout/Layout';

// Pages
import Dashboard from './pages/Dashboard';
import Documents from './pages/Documents';
import Practice from './pages/Practice';
import Analytics from './pages/Analytics';
import DocumentViewer from './pages/DocumentViewer';

import KnowledgeGraph from './pages/KnowledgeGraph';
import CurriculumList from './pages/CurriculumList';
import CurriculumView from './pages/CurriculumView';
import Settings from './pages/Settings';
import DailyGoals from './pages/DailyGoals';
import AdminEmails from './pages/AdminEmails';


const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="documents" element={<Documents />} />
            <Route path="documents/:id" element={<DocumentViewer />} />
            <Route path="practice" element={<Practice />} />
            <Route path="knowledge-graph" element={<KnowledgeGraph />} />

            <Route path="curriculum" element={<CurriculumList />} />
            <Route path="curriculum/:id" element={<CurriculumView />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="settings" element={<Settings />} />
            <Route path="daily-goals" element={<DailyGoals />} />
            <Route path="admin/emails" element={<AdminEmails />} />
          </Route>
        </Routes>
      </Router>
    </QueryClientProvider>
  );
}

export default App;
