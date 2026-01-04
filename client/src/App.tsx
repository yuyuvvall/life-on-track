import { Routes, Route, Navigate } from 'react-router-dom';
import { PulseDashboard } from '@/views/PulseDashboard';
import { ClosingEventView } from '@/views/ClosingEventView';
import { GoalsSummaryView } from '@/views/GoalsSummaryView';
import { GoalDetailView } from '@/views/GoalDetailView';
import { QuickAddModal } from '@/components/QuickAddModal';
import { IntegrityModal } from '@/components/IntegrityModal';

function App() {
  return (
    <div className="min-h-screen bg-surface-900">
      <Routes>
        <Route path="/" element={<PulseDashboard />} />
        <Route path="/weekly" element={<ClosingEventView />} />
        <Route path="/goals" element={<GoalsSummaryView />} />
        <Route path="/goals/:id" element={<GoalDetailView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      
      {/* Global modals */}
      <QuickAddModal />
      <IntegrityModal />
    </div>
  );
}

export default App;

