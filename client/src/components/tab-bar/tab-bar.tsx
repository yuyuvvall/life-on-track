import './tab-bar.less'
import { Link, useLocation } from 'react-router-dom'
import { UserButton } from '@clerk/react'

const TABS = [
  { path: '/', label: 'Pulse', icon: '⚡' },
  { path: '/goals', label: 'Goals', icon: '🎯' },
  { path: '/weekly', label: 'Weekly', icon: '📊' },
  { path: '/expenses', label: 'Expenses', icon: '💰' },
] as const

const TabBar = () => {
  const location = useLocation()

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/'
    }
    return location.pathname.startsWith(path)
  }

  return (
    <nav className="tab-bar">
      <div className="tab-bar__list">
        {TABS.map((tab) => (
          <Link
            key={tab.path}
            to={tab.path}
            className={`tab-bar__tab${isActive(tab.path) ? ' tab-bar__tab--active' : ''}`}
          >
            <span className="tab-bar__icon">{tab.icon}</span>
            <span className="tab-bar__label">{tab.label}</span>
          </Link>
        ))}
        <div className="tab-bar__tab tab-bar__account">
          <UserButton />
          <span className="tab-bar__label">Account</span>
        </div>
      </div>
    </nav>
  )
}

export default TabBar
