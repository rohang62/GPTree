import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'

interface AuthState {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: any }>
  signUp: (email: string, password: string, firstName: string, lastName: string, username: string) => Promise<{ error: any; requiresSignIn?: boolean }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<{ error: any }>
  loadProfile: () => Promise<void>
}

export interface UserProfile {
  id: string
  user_id: string
  first_name: string
  last_name: string
  username: string
  email: string
  created_at: string
  updated_at: string
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  loading: true,

  signIn: async (email: string, password: string) => {
    try {
      // Check Supabase configuration
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      
      if (!supabaseUrl || !supabaseKey || supabaseUrl === 'https://placeholder.supabase.co') {
        return { 
          error: { 
            message: 'Supabase is not configured. Please check your environment variables.' 
          } 
        }
      }

      const response = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })


      if (response.error) {
        let errorMessage = response.error.message
        
        // More specific error messages
        if (response.error.message.includes('Invalid login credentials')) {
          errorMessage = 'Invalid email or password. Please check your credentials.'
        } else if (response.error.message.includes('Email not confirmed')) {
          errorMessage = 'Please check your email to confirm your account before signing in.'
        } else if (response.error.message.includes('User not found')) {
          errorMessage = 'No account found with this email. Please sign up first.'
        } else if (response.error.message.includes('too many requests')) {
          errorMessage = 'Too many login attempts. Please try again later.'
        }
        
        return { error: { ...response.error, message: errorMessage } }
      }

      if (response.data?.user && response.data?.session) {
        set({ user: response.data.user, loading: false })
        await get().loadProfile().catch(() => {})
        return { error: null }
      }

      // Edge case: user exists but no session
      if (response.data?.user && !response.data?.session) {
        return { 
          error: { 
            message: 'Account found but no session created. Please try again or contact support.' 
          } 
        }
      }

      // No user at all
      return { 
        error: { 
          message: 'Login failed. Please check your credentials and try again.' 
        } 
      }
    } catch (err: any) {
      return { 
        error: { 
          message: err.message || 'An unexpected error occurred. Please try again.' 
        } 
      }
    }
  },

  signUp: async (email: string, password: string, firstName: string, lastName: string, username: string) => {
    try {
      // Validate inputs
      if (!email || !password || !firstName || !lastName || !username) {
        return { error: { message: 'All fields are required' } }
      }

      // Sign up the user in Supabase Auth (skip email confirmation)
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: undefined, // Skip email confirmation
          data: {
            first_name: firstName,
            last_name: lastName,
            username: username,
          },
        },
      })

      if (error) {
        let errorMessage = error.message
        if (error.message.includes('already registered') || error.message.includes('already exists')) {
          errorMessage = 'An account with this email already exists. Please sign in instead.'
        } else if (error.message.includes('invalid')) {
          errorMessage = 'Please check your email and password format.'
        }
        return { error: { ...error, message: errorMessage } }
      }

      // If user created but no session (email confirmation required), auto-confirm
      if (data.user && !data.session) {
        // Try to sign in immediately to get a session
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        
        if (signInError) {
          // If sign in fails, user might need email confirmation
          // But we'll still create the profile and let them sign in manually
        } else if (signInData.user) {
          // Successfully signed in, use this session
          set({ user: signInData.user })
          await get().loadProfile().catch(() => {})
          return { error: null }
        }
      }

      // Create profile using database function (bypasses RLS)
      if (data.user) {
        const { data: functionResult, error: functionError } = await supabase.rpc('create_profile_for_user', {
          p_user_id: data.user.id,
          p_first_name: firstName,
          p_last_name: lastName,
          p_username: username,
          p_email: email,
        })

        if (functionError) {
          
          // If function doesn't exist, tell user to create it
          if (functionError.message?.includes('function') || functionError.code === '42883' || functionError.message?.includes('does not exist')) {
            return { 
              error: { 
                message: 'Database function not found. Please run WORKING_FIX.sql in Supabase SQL Editor first.' 
              } 
            }
          }
          
          // If it's a permission error
          if (functionError.message?.includes('permission') || functionError.code === '42501') {
            return {
              error: {
                message: 'Permission denied. Please run the GRANT statements in WORKING_FIX.sql: GRANT EXECUTE ON FUNCTION public.create_profile_for_user TO anon, authenticated;'
              }
            }
          }
          
          // If it's a different error, show the actual error
          return {
            error: {
              message: functionError.message || 'Function call failed. Check browser console for details.',
              details: functionError
            }
          }
        }
        
        // Function succeeded
        if (functionResult) {
          // Verify profile was created
          const { data: verifyProfile } = await supabase
            .from('profiles')
            .select('*')
            .eq('user_id', data.user.id)
            .single()
          
          if (!verifyProfile) {
            // Profile not found, but function returned success - might be a timing issue
          }
        } else {
          // Function returned null/undefined - might still be successful
          // Check if profile exists anyway
          const { data: verifyProfile } = await supabase
            .from('profiles')
            .select('*')
            .eq('user_id', data.user.id)
            .single()
          
          if (!verifyProfile) {
            return {
              error: {
                message: 'Profile was not created. Please check Supabase logs or try again.'
              }
            }
          }
        }

        // Set user even if no session (they'll need to sign in)
        set({ user: data.user })
        await get().loadProfile().catch(() => {})
      }

      // If we have a session, user is logged in
      if (data.session) {
        set({ user: data.user })
        await get().loadProfile().catch(() => {})
        return { error: null }
      }

      // No session - user needs to sign in manually
      return { 
        error: null,
        requiresSignIn: true 
      }
    } catch (err: any) {
      return { 
        error: { 
          message: err.message || 'An unexpected error occurred. Please try again.' 
        } 
      }
    }
  },

  signOut: async () => {
    try {
      // Sign out from Supabase first (this clears session storage)
      await supabase.auth.signOut()
      
      // Clear all Supabase-related storage
      try {
        // Clear localStorage items that Supabase might use
        const keysToRemove: string[] = []
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key && (key.includes('supabase') || key.includes('sb-'))) {
            keysToRemove.push(key)
          }
        }
        keysToRemove.forEach(key => {
          localStorage.removeItem(key)
        })
        
        // Clear sessionStorage items
        const sessionKeysToRemove: string[] = []
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i)
          if (key && (key.includes('supabase') || key.includes('sb-'))) {
            sessionKeysToRemove.push(key)
          }
        }
        sessionKeysToRemove.forEach(key => {
          sessionStorage.removeItem(key)
        })
      } catch (storageError) {
        // Ignore storage errors
      }
      
      // Clear state immediately
      set({ user: null, profile: null, loading: false })
      
    } catch (err) {
      // Ensure state is cleared even on error
      set({ user: null, profile: null, loading: false })
      
      // Try to clear storage even on error
      try {
        localStorage.clear()
        sessionStorage.clear()
      } catch (e) {
        // Ignore storage errors
      }
    }
  },

  resetPassword: async (_email: string) => {
    // Disabled for now - just return success message
    return { error: { message: 'Password reset is currently disabled. Please contact support.' } }
  },

  loadProfile: async () => {
    try {
      const { user } = get()
      if (!user) {
        set({ profile: null })
        return
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (!error && data) {
        set({ profile: data })
      }
    } catch (err) {
      // Don't throw - allow app to continue
    }
  },
}))

// Initialize auth state (with error handling)
try {
  // Set up auth state change listener
  supabase.auth.onAuthStateChange(async (event, session) => {
    try {
      // Handle SIGNED_OUT event explicitly
      if (event === 'SIGNED_OUT') {
        useAuthStore.setState({ 
          user: null,
          profile: null,
          loading: false
        })
        return
      }
      
      useAuthStore.setState({ 
        user: session?.user ?? null,
        loading: false,
      })
      
      if (session?.user) {
        // Only load profile if we don't already have it
        const currentState = useAuthStore.getState()
        if (!currentState.profile || currentState.profile.user_id !== session.user.id) {
          // Load profile after a short delay to ensure user state is set
          setTimeout(() => {
            useAuthStore.getState().loadProfile().catch(() => {})
          }, 100)
        }
      } else {
        useAuthStore.setState({ profile: null })
      }
    } catch (error) {
      useAuthStore.setState({ loading: false })
    }
  })

  // Get initial session immediately
  const checkSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      useAuthStore.setState({ 
        user: session?.user ?? null,
        loading: false,
        profile: null
      })
      
      if (session?.user) {
        // Load profile after a short delay to ensure user state is set
        setTimeout(() => {
          useAuthStore.getState().loadProfile().catch(() => {})
        }, 100)
      }
    } catch (error) {
      useAuthStore.setState({ 
        user: null,
        profile: null,
        loading: false 
      })
    }
  }
  
  // Call immediately
  checkSession()
  
  // Also set a timeout to ensure loading doesn't hang forever
  setTimeout(() => {
    const state = useAuthStore.getState()
    if (state.loading) {
      useAuthStore.setState({ loading: false })
    }
  }, 2000)
} catch (error) {
  useAuthStore.setState({ 
    user: null,
    profile: null,
    loading: false 
  })
}

