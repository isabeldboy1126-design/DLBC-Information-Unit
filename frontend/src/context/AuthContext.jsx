import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase, isSupabaseConfigured } from '../services/supabase'
import { setAuthToken, authFetch, getApiUrl } from '../config'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [session, setSession] = useState(null)
  const [account, setAccount] = useState(null)
  const [isOnboarded, setIsOnboarded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [authNotice, setAuthNotice] = useState(null)

  // Fetch account profile and onboarding state from FastAPI backend
  const fetchAccountProfile = useCallback(async (accessToken) => {
    if (!accessToken) {
      setAccount(null)
      setIsOnboarded(false)
      return null
    }

    try {
      setAuthToken(accessToken)
      const res = await authFetch('/api/auth/me', {
        headers: { Authorization: Bearer  },
      })

      if (res.ok) {
        const data = await res.json()
        setAccount(data.account || null)
        setIsOnboarded(Boolean(data.is_onboarded))
        return data
      } else if (res.status === 401) {
        // Token invalid / expired
        setAccount(null)
        setIsOnboarded(false)
      } else {
        // Non-fatal profile fetch failure
        console.warn('Backend /api/auth/me returned status:', res.status)
      }
    } catch (err) {
      console.error('Error fetching account profile:', err)
    }
    return null
  }, [])

  // Initialize auth state on mount
  useEffect(() => {
    let isMounted = true

    async function initAuth() {
      if (!isSupabaseConfigured || !supabase) {
        setLoading(false)
        return
      }

      try {
        const { data: { session: initialSession }, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError

        if (initialSession && isMounted) {
          setSession(initialSession)
          setUser(initialSession.user)
          setAuthToken(initialSession.access_token)
          await fetchAccountProfile(initialSession.access_token)
        }
      } catch (err) {
        console.error('Auth initialization error:', err)
        if (isMounted) setError(err.message)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    initAuth()

    // Listen to Supabase auth state changes
    if (isSupabaseConfigured && supabase) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
        if (!isMounted) return

        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          setSession(newSession)
          setUser(newSession?.user || null)
          setAuthToken(newSession?.access_token || null)
          if (newSession?.access_token) {
            await fetchAccountProfile(newSession.access_token)
          }
        } else if (event === 'SIGNED_OUT') {
          setSession(null)
          setUser(null)
          setAccount(null)
          setIsOnboarded(false)
          setAuthToken(null)
        }
      })

      return () => {
        isMounted = false
        subscription.unsubscribe()
      }
    }

    return () => {
      isMounted = false
    }
  }, [fetchAccountProfile])

  // Login handler
  const login = async (email, password) => {
    setError(null)
    setAuthNotice(null)
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Authentication is not configured. Please contact the administrator.')
    }

    const cleanEmail = email.trim()
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    })

    if (signInError) {
      // Use clean product error message to not reveal detailed internals
      const message = signInError.message?.toLowerCase().includes('invalid login credentials')
        ? 'Email or password is incorrect.'
        : 'Sign in failed. Please verify your credentials and try again.'
      setError(message)
      throw new Error(message)
    }

    if (data.session) {
      setSession(data.session)
      setUser(data.user)
      setAuthToken(data.session.access_token)
      await fetchAccountProfile(data.session.access_token)
    }

    return data
  }

  // Create account handler
  const signUp = async (email, password) => {
    setError(null)
    setAuthNotice(null)
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Authentication is not configured. Please contact the administrator.')
    }

    const cleanEmail = email.trim()
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      },
    })

    if (signUpError) {
      const message = signUpError.message?.toLowerCase().includes('already registered')
        ? 'An account with this email address already exists.'
        : signUpError.message || 'Account creation failed. Please try again.'
      setError(message)
      throw new Error(message)
    }

    // Check if session returned immediately or confirmation required
    if (data.session) {
      setSession(data.session)
      setUser(data.user)
      setAuthToken(data.session.access_token)
      await fetchAccountProfile(data.session.access_token)
      return { success: true, requiresConfirmation: false, data }
    } else {
      // Email confirmation is required by Supabase
      setAuthNotice('Check your email. We sent you a confirmation link to verify your account.')
      return { success: true, requiresConfirmation: true, data }
    }
  }

  // Sign out handler
  const signOut = async () => {
    setError(null)
    setAuthNotice(null)
    try {
      if (isSupabaseConfigured && supabase) {
        await supabase.auth.signOut()
      }
    } catch (e) {
      console.warn('Sign out error:', e)
    } finally {
      setSession(null)
      setUser(null)
      setAccount(null)
      setIsOnboarded(false)
      setAuthToken(null)
    }
  }

  // Password reset request
  const resetPassword = async (email) => {
    setError(null)
    setAuthNotice(null)
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Authentication is not configured.')
    }

    const cleanEmail = email.trim()
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: `${window.location.origin}/#reset-password`,
    })

    if (resetError) {
      throw new Error(resetError.message || 'Failed to send password reset email.')
    }

    setAuthNotice('If an account exists for that email, a password reset link has been sent.')
    return { success: true }
  }

  // Update password after clicking reset link
  const updatePassword = async (newPassword) => {
    setError(null)
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Authentication is not configured.')
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    })

    if (updateError) {
      throw new Error(updateError.message || 'Failed to update password.')
    }

    return { success: true }
  }

  // Save progressive onboarding state
  const saveOnboardingProgress = async (payload, step) => {
    try {
      const res = await authFetch('/api/auth/onboarding/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, step }),
      })
      if (!res.ok) throw new Error('Failed to save progress')
      const data = await res.json()
      if (data.account) {
        setAccount(data.account)
      }
      return data
    } catch (e) {
      console.error('Error saving onboarding progress:', e)
      throw e
    }
  }

  // Complete initial onboarding
  const completeOnboarding = async (payload) => {
    try {
      const res = await authFetch('/api/auth/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to complete onboarding')
      const data = await res.json()
      if (data.account) {
        setAccount(data.account)
        setIsOnboarded(true)
      }
      return data
    } catch (e) {
      console.error('Error completing onboarding:', e)
      throw e
    }
  }

  // Atomic finish for Replay Onboarding
  const replayOnboardingFinish = async (payload) => {
    try {
      const res = await authFetch('/api/auth/onboarding/replay-finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to update church hierarchy')
      const data = await res.json()
      if (data.account) {
        setAccount(data.account)
      }
      return data
    } catch (e) {
      console.error('Error finishing replay onboarding:', e)
      throw e
    }
  }

  const value = {
    user,
    session,
    account,
    isOnboarded,
    loading,
    error,
    authNotice,
    login,
    signUp,
    signOut,
    resetPassword,
    updatePassword,
    refreshAccount: () => session?.access_token ? fetchAccountProfile(session.access_token) : null,
    saveOnboardingProgress,
    completeOnboarding,
    replayOnboardingFinish,
    clearError: () => setError(null),
    clearNotice: () => setAuthNotice(null),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
