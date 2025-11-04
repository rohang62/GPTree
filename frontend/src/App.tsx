import { Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { ChatLayout } from './components/ChatLayout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Login } from './pages/Login'
import { Signup } from './pages/Signup'
import { ForgotPassword } from './pages/ForgotPassword'
import './App.css'

function LoadingFallback() {
  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      height: '100vh',
      backgroundColor: '#f5f5f5',
      color: '#333'
    }}>
      <div style={{ textAlign: 'center' }}>
        <h1>Loading RohanGPT...</h1>
        <p>Please wait while the app loads</p>
      </div>
    </div>
  );
}

function App() {
  // Check if Supabase is configured
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const isSupabaseConfigured = supabaseUrl && supabaseUrl !== '' && supabaseUrl !== 'https://placeholder.supabase.co'

  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        {isSupabaseConfigured ? (
          <>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <ChatLayout />
                </ProtectedRoute>
              }
            />
            {/* Redirect any unknown routes to login if not authenticated */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </>
        ) : (
          // If Supabase not configured, show chat directly (for development)
          <>
            <Route
              path="/"
              element={<ChatLayout />}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        )}
      </Routes>
    </Suspense>
  );
}

export default App
