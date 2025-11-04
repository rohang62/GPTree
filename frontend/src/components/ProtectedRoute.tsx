import { useEffect } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { user, loading } = useAuthStore()
  const navigate = useNavigate()

  // If Supabase is not configured, allow access (for development)
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const isSupabaseConfigured = supabaseUrl && supabaseUrl !== '' && supabaseUrl !== 'https://placeholder.supabase.co'

  if (!isSupabaseConfigured) {
    // If Supabase not configured, allow access (for development)
    return <>{children}</>
  }

  // Watch for auth state changes and redirect if user becomes null
  useEffect(() => {
    if (!loading && !user && isSupabaseConfigured) {
      navigate('/login', { replace: true })
    }
  }, [user, loading, navigate, isSupabaseConfigured])

  // Timeout to prevent infinite loading
  useEffect(() => {
    if (loading) {
      const timer = setTimeout(() => {
        const currentState = useAuthStore.getState()
        if (currentState.loading && !currentState.user) {
          navigate('/login', { replace: true })
        }
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [loading, navigate])

  // Show loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--chat-bg)]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-[var(--text-secondary)]">Loading...</p>
        </div>
      </div>
    )
  }

  // Always redirect to login if no user (immediate redirect)
  if (!user && isSupabaseConfigured) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

