import './auth-gate.less'
import { useEffect, type ReactNode } from 'react'
import { Show, SignIn, useAuth } from '@clerk/react'
import { useQueryClient } from '@tanstack/react-query'
import { setAuthTokenGetter } from '@/api/client'

// Bridges the Clerk session token into the non-React api client module
const TokenBridge = () => {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()

  useEffect(() => {
    setAuthTokenGetter(() => getToken())
    return () => setAuthTokenGetter(null)
  }, [getToken])

  // Unmounts on sign-out: drop cached data so the next account never sees it
  useEffect(() => {
    return () => queryClient.clear()
  }, [queryClient])

  return null
}

const AuthGate = ({ children }: { children: ReactNode }) => {
  return (
    <>
      <Show when="signed-in">
        <TokenBridge />
        {children}
      </Show>
      <Show when="signed-out">
        <div className="auth-gate">
          <SignIn />
        </div>
      </Show>
    </>
  )
}

export default AuthGate
