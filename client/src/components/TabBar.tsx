import { Link, useLocation } from 'react-router-dom';

const TABS = [
  { path: '/', label: 'Pulse', icon: '⚡' },
  { path: '/goals', label: 'Goals', icon: '🎯' },
  { path: '/weekly', label: 'Weekly', icon: '📊' },
  { path: '/expenses', label: 'Expenses', icon: '💰' },
] as const;

export function TabBar() {
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <nav className="sticky top-0 z-40 bg-surface-800 border-b border-surface-700">
      <div className="flex">
        {TABS.map((tab) => (
          <Link
            key={tab.path}
            to={tab.path}
            className={`flex-1 flex flex-col items-center py-3 transition-colors
              ${isActive(tab.path) 
                ? 'text-accent-blue border-b-2 border-accent-blue bg-surface-700/50' 
                : 'text-gray-400 hover:text-gray-200 hover:bg-surface-700/30'
              }`}
          >
            <span className="text-lg mb-0.5">{tab.icon}</span>
            <span className="text-xs font-medium">{tab.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}

