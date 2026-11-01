import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useAuth } from './auth-context'

interface AuthDialogProps {
  onClose: () => void
}

type AuthMode = 'login' | 'register'

export function AuthDialog({ onClose }: AuthDialogProps) {
  const {
    status,
    user,
    pending,
    error,
    notice,
    clearFeedback,
    register,
    signIn,
    signOut,
    deleteAccount,
  } = useAuth()
  const [mode, setMode] = useState<AuthMode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmingDeletion, setConfirmingDeletion] = useState(false)
  const [deletionPhrase, setDeletionPhrase] = useState('')
  const [deleted, setDeleted] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    document.body.style.overflow = 'hidden'
    const initialFocus =
      emailRef.current ??
      dialogRef.current?.querySelector<HTMLElement>('button:not(:disabled)')
    initialFocus?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab' || !dialogRef.current) {
        return
      }

      const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
      )
      const firstElement = focusableElements.item(0)
      const lastElement = focusableElements.item(focusableElements.length - 1)

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault()
        lastElement?.focus()
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault()
        firstElement?.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
      previousFocus?.focus()
    }
  }, [])

  function changeMode(nextMode: AuthMode) {
    clearFeedback()
    setMode(nextMode)
    setPassword('')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    clearFeedback()

    try {
      if (mode === 'register') {
        await register({ name, email, password })
        setPassword('')
        return
      }

      await signIn({ email, password })
      onClose()
    } catch {
      setPassword('')
    }
  }

  async function logout() {
    try {
      await signOut()
      onClose()
    } catch {
      return
    }
  }

  async function confirmAccountDeletion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    try {
      await deleteAccount()
      setDeleted(true)
    } catch {
      return
    }
  }

  return (
    <div
      className="assistant-dialog-backdrop auth-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onClose()
      }}
    >
      <section
        ref={dialogRef}
        className="assistant-dialog auth-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-dialog-title"
        aria-describedby="auth-dialog-description"
      >
        <button
          className="dialog-close"
          type="button"
          aria-label="Close account dialog"
          onClick={onClose}
          disabled={pending}
        >
          <span aria-hidden="true">×</span>
        </button>

        {deleted ? (
          <>
            <span className="dialog-icon auth-dialog-icon" aria-hidden="true">✓</span>
            <span className="section-kicker">ACCOUNT REMOVED</span>
            <h2 id="auth-dialog-title">Your account was deleted.</h2>
            <p id="auth-dialog-description">
              Your Supabase Auth identity has been removed. There is no saved
              conversation history in this prototype.
            </p>
            <button className="button button-primary dialog-action" type="button" onClick={onClose}>
              Close
            </button>
          </>
        ) : status === 'loading' ? (
          <>
            <span className="section-kicker">MEDIGUIDE AI</span>
            <h2 id="auth-dialog-title">Checking your account…</h2>
            <p id="auth-dialog-description" role="status">
              Verifying your secure session.
            </p>
          </>
        ) : status === 'authenticated' && user ? (
          <>
            <span className="dialog-icon auth-dialog-icon" aria-hidden="true">✓</span>
            <span className="section-kicker">YOUR ACCOUNT</span>
            <h2 id="auth-dialog-title">Welcome back.</h2>
            <p id="auth-dialog-description" className="auth-account-email">
              Signed in as <strong>{user.email}</strong>
            </p>
            <p className="auth-history-note">
              Conversation history is not available yet. Nothing is saved here.
            </p>
            {error && <p className="auth-feedback auth-feedback-error" role="alert">{error}</p>}
            <div className="auth-account-actions">
              <button
                className="button button-quiet"
                type="button"
                onClick={() => void logout()}
                disabled={pending}
              >
                {pending ? 'Please wait…' : 'Sign out'}
              </button>
              {!confirmingDeletion ? (
                <button
                  className="auth-danger-link"
                  type="button"
                  onClick={() => {
                    clearFeedback()
                    setConfirmingDeletion(true)
                  }}
                  disabled={pending}
                >
                  Delete account
                </button>
              ) : (
                <form className="auth-delete-form" onSubmit={(event) => void confirmAccountDeletion(event)}>
                  <p>
                    This permanently removes your authentication account. Type
                    <strong> DELETE </strong> to confirm.
                  </p>
                  <label htmlFor="delete-confirmation">Confirmation</label>
                  <input
                    id="delete-confirmation"
                    value={deletionPhrase}
                    onChange={(event) => setDeletionPhrase(event.target.value)}
                    autoComplete="off"
                    required
                  />
                  <div className="auth-delete-actions">
                    <button
                      className="button button-quiet"
                      type="button"
                      onClick={() => {
                        setConfirmingDeletion(false)
                        setDeletionPhrase('')
                        clearFeedback()
                      }}
                      disabled={pending}
                    >
                      Cancel
                    </button>
                    <button
                      className="button button-danger"
                      type="submit"
                      disabled={pending || deletionPhrase !== 'DELETE'}
                    >
                      {pending ? 'Deleting…' : 'Confirm deletion'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </>
        ) : (
          <>
            <span className="dialog-icon auth-dialog-icon" aria-hidden="true">+</span>
            <span className="section-kicker">MEDIGUIDE AI ACCOUNT</span>
            <h2 id="auth-dialog-title">
              {mode === 'login' ? 'Welcome back.' : 'Create your account.'}
            </h2>
            <p id="auth-dialog-description">
              Your account keeps your access secure. Health conversations are
              not saved in this prototype.
            </p>

            {status === 'unavailable' && (
              <p className="auth-feedback auth-feedback-warning" role="status">
                We could not verify an existing session. You can try signing in
                again; account services may be temporarily unavailable.
              </p>
            )}

            <div className="auth-mode-switch" role="group" aria-label="Account action">
              <button
                type="button"
                aria-pressed={mode === 'login'}
                onClick={() => changeMode('login')}
              >
                Sign in
              </button>
              <button
                type="button"
                aria-pressed={mode === 'register'}
                onClick={() => changeMode('register')}
              >
                Create account
              </button>
            </div>

            <form className="auth-form" onSubmit={(event) => void submit(event)}>
              {mode === 'register' && (
                <div className="auth-field">
                  <label htmlFor="auth-name">Name</label>
                  <input
                    id="auth-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoComplete="name"
                    maxLength={80}
                    required
                  />
                </div>
              )}
              <div className="auth-field">
                <label htmlFor="auth-email">Email</label>
                <input
                  ref={emailRef}
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  maxLength={254}
                  required
                />
              </div>
              <div className="auth-field">
                <label htmlFor="auth-password">Password</label>
                <input
                  id="auth-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  minLength={12}
                  maxLength={128}
                  required
                />
                {mode === 'register' && (
                  <span className="auth-field-hint">Use at least 12 characters.</span>
                )}
              </div>
              {error && <p className="auth-feedback auth-feedback-error" role="alert">{error}</p>}
              {notice && <p className="auth-feedback auth-feedback-success" role="status">{notice}</p>}
              <button className="button button-primary auth-submit" type="submit" disabled={pending}>
                {pending
                  ? 'Please wait…'
                  : mode === 'login'
                    ? 'Sign in securely'
                    : 'Create account'}
              </button>
            </form>
            <p className="auth-security-note">
              <span aria-hidden="true">▣</span>
              Session tokens stay in secure, HttpOnly cookies.
            </p>
          </>
        )}
      </section>
    </div>
  )
}
