import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { PulseDashboard } from '@/views/PulseDashboard';
import { ClosingEventView } from '@/views/ClosingEventView';
import { GoalsSummaryView } from '@/views/GoalsSummaryView';
import { GoalDetailView } from '@/views/GoalDetailView';
import { ExpenseQuickAdd } from '@/views/ExpenseQuickAdd';
import { ExpensesView } from '@/views/ExpensesView';
import { TabBar } from '@/components/TabBar';
import { QuickAddModal } from '@/components/QuickAddModal';
import { IntegrityModal } from '@/components/IntegrityModal';

// Pages where TabBar should NOT be shown
const HIDDEN_TAB_ROUTES = ['/expense/add', '/expense/edit/', '/goals/'];

function AppContent() {
  const location = useLocation();
  
  // Check if we should show the tab bar
  const showTabBar = !HIDDEN_TAB_ROUTES.some(route => {
    if (route.endsWith('/')) {
      // For routes like /goals/, check if path starts with it and has more content
      return location.pathname.startsWith(route) && location.pathname !== route.slice(0, -1);
    }
    return location.pathname === route;
  });

  return (
    <div className="min-h-screen bg-surface-900">
      {/* Tab Navigation */}
      {showTabBar && <TabBar />}
      
      <Routes>
        <Route path="/" element={<PulseDashboard />} />
        <Route path="/weekly" element={<ClosingEventView />} />
        <Route path="/goals" element={<GoalsSummaryView />} />
        <Route path="/goals/:id" element={<GoalDetailView />} />
        <Route path="/expenses" element={<ExpensesView />} />
        <Route path="/expense/add" element={<ExpenseQuickAdd />} />
        <Route path="/expense/edit/:id" element={<ExpenseQuickAdd />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      
      {/* Global modals */}
      <QuickAddModal />
      <IntegrityModal />
    </div>
  );
}

function App() {
  return <AppContent />;
}

export default App;
