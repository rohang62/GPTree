import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'
import { UserPlus, Mail, Lock, User, AlertCircle, CheckCircle } from 'lucide-react'

export const Signup = () => {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [repeatPassword, setRepeatPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signUp, user, loading: authLoading } = useAuthStore()
  const navigate = useNavigate()

  // Redirect if already logged in
  useEffect(() => {
    if (!authLoading && user) {
      navigate('/', { replace: true })
    }
  }, [user, authLoading, navigate])

  const validatePassword = () => {
    if (password.length < 8) {
      return 'Password must be at least 8 characters'
    }
    if (password !== repeatPassword) {
      return 'Passwords do not match'
    }
    return null
  }

  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess(false)

    const passwordError = validatePassword()
    if (passwordError) {
      setError(passwordError)
      return
    }

    // Validate other fields
    if (!firstName.trim() || !lastName.trim() || !username.trim() || !email.trim()) {
      setError('All fields are required')
      return
    }

    // Validate username format (alphanumeric and underscores)
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setError('Username can only contain letters, numbers, and underscores')
      return
    }

    setLoading(true)

    try {
      const result = await signUp(email, password, firstName.trim(), lastName.trim(), username.trim())

      if (result.error) {
        const errorMsg = result.error.message || result.error.hint || 'Failed to sign up. Please try again.'
        setError(errorMsg)
        setLoading(false)
      } else if (result.requiresSignIn) {
        // Profile created but need to sign in
        setSuccess(true)
        setError('')
        setLoading(false)
        // Auto-redirect to login after 2 seconds
        setTimeout(() => {
          navigate('/login', { replace: true })
        }, 2000)
      } else {
        // Signup successful and logged in, navigate to chat
        navigate('/', { replace: true })
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.')
      setLoading(false)
    }
  }

  const passwordMatch = password && repeatPassword && password === repeatPassword
  const passwordLength = password.length >= 8

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Create Account
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Sign up to get started with RohanGPT
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertCircle size={18} />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-center gap-2 text-green-600 dark:text-green-400">
              <CheckCircle size={18} />
              <div className="text-sm">
                <p className="font-semibold">Account created!</p>
                <p className="text-xs mt-1">Redirecting to sign in...</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  First Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="John"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Last Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="Doe"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Username
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="johndoe"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="john@example.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="At least 8 characters"
                />
              </div>
              {password && (
                <div className="mt-1 flex items-center gap-1 text-xs">
                  {passwordLength ? (
                    <CheckCircle size={14} className="text-green-500" />
                  ) : (
                    <AlertCircle size={14} className="text-red-500" />
                  )}
                  <span className={passwordLength ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                    At least 8 characters
                  </span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Repeat Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="password"
                  value={repeatPassword}
                  onChange={(e) => setRepeatPassword(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Repeat your password"
                />
              </div>
              {repeatPassword && (
                <div className="mt-1 flex items-center gap-1 text-xs">
                  {passwordMatch ? (
                    <CheckCircle size={14} className="text-green-500" />
                  ) : (
                    <AlertCircle size={14} className="text-red-500" />
                  )}
                  <span className={passwordMatch ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                    Passwords match
                  </span>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !passwordMatch || !passwordLength}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <UserPlus size={20} />
              {loading ? 'Creating account...' : 'Sign Up'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Already have an account?{' '}
              <Link
                to="/login"
                className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-semibold"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

