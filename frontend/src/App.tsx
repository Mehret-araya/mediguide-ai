import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { AuthDialog } from './auth/AuthDialog'
import { useAuth } from './auth/auth-context'
import {
  conversationsApi,
  type ConversationMessage,
  type ConversationSummary,
} from './conversations/api'
import {
  facilitiesApi,
  type HealthcareFacility,
} from './facilities/api'
import './App.css'

type IconName =
  | 'arrow'
  | 'book'
  | 'calendar'
  | 'chat'
  | 'check'
  | 'chevron'
  | 'clock'
  | 'close'
  | 'heart'
  | 'menu'
  | 'pin'
  | 'plus'
  | 'search'
  | 'shield'
  | 'spark'
  | 'sun'

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const shared = {
    'aria-hidden': true as const,
    fill: 'none',
    height: size,
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 1.8,
    viewBox: '0 0 24 24',
    width: size,
  }

  switch (name) {
    case 'arrow':
      return (
        <svg {...shared}>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      )
    case 'book':
      return (
        <svg {...shared}>
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z" />
          <path d="M4 5.5v16M8 7h8M8 11h7" />
        </svg>
      )
    case 'calendar':
      return (
        <svg {...shared}>
          <rect x="3" y="5" width="18" height="16" rx="3" />
          <path d="M16 3v4M8 3v4M3 10h18" />
        </svg>
      )
    case 'chat':
      return (
        <svg {...shared}>
          <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-6.5A7.5 7.5 0 1 1 20 11.5Z" />
          <path d="M8 11h8M8 14h5" />
        </svg>
      )
    case 'check':
      return (
        <svg {...shared}>
          <path d="m5 12 4 4L19 6" />
        </svg>
      )
    case 'chevron':
      return (
        <svg {...shared}>
          <path d="m7 10 5 5 5-5" />
        </svg>
      )
    case 'clock':
      return (
        <svg {...shared}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      )
    case 'close':
      return (
        <svg {...shared}>
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      )
    case 'heart':
      return (
        <svg {...shared}>
          <path d="M20.8 8.6c0 5.4-8.8 11-8.8 11s-8.8-5.6-8.8-11A4.6 4.6 0 0 1 12 6.2a4.6 4.6 0 0 1 8.8 2.4Z" />
        </svg>
      )
    case 'menu':
      return (
        <svg {...shared}>
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      )
    case 'pin':
      return (
        <svg {...shared}>
          <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
          <circle cx="12" cy="10" r="2.5" />
        </svg>
      )
    case 'plus':
      return (
        <svg {...shared}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      )
    case 'search':
      return (
        <svg {...shared}>
          <circle cx="10.8" cy="10.8" r="6.8" />
          <path d="m16 16 5 5" />
        </svg>
      )
    case 'shield':
      return (
        <svg {...shared}>
          <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      )
    case 'spark':
      return (
        <svg {...shared}>
          <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />
          <path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" />
        </svg>
      )
    case 'sun':
      return (
        <svg {...shared}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
        </svg>
      )
  }
}

const healthFeatures: {
  icon: IconName
  label: string
  title: string
  description: string
  status: string
}[] = [
  {
    icon: 'book',
    label: 'LEARN',
    title: 'Everyday wellbeing',
    description:
      'A thoughtful place to explore reviewed, easy-to-understand health education.',
    status: 'Education library in development',
  },
  {
    icon: 'heart',
    label: 'UNDERSTAND',
    title: 'Health topics',
    description:
      'Clear explanations designed to help you prepare for conversations with a health professional.',
    status: 'Reviewed content coming later',
  },
  {
    icon: 'shield',
    label: 'TAKE CARE',
    title: 'Prevention & care',
    description:
      'Explore practical health information with transparent sources and limitations.',
    status: 'Curated sources not connected',
  },
]

const navigation = [
  { href: '#assistant', label: 'AI Assistant' },
  { href: '#explore', label: 'Explore' },
  { href: '#facilities', label: 'Facilities' },
  { href: '#history', label: 'My history' },
]

function App() {
  const { status, user } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [assistantNotice, setAssistantNotice] = useState('')
  const [facilitySearch, setFacilitySearch] = useState('')
  const [facilityNotice, setFacilityNotice] = useState('')
  const [facilityType, setFacilityType] = useState('')
  const [facilities, setFacilities] = useState<HealthcareFacility[]>([])
  const [facilityLoading, setFacilityLoading] = useState(false)
  const [expandedFeature, setExpandedFeature] = useState<string | null>(null)
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [assistantLoadingUserId, setAssistantLoadingUserId] = useState<string | null>(null)
  const [historyError, setHistoryError] = useState('')
  const [historyOwnerId, setHistoryOwnerId] = useState<string | null>(null)
  const authenticatedUserIdRef = useRef<string | null>(null)
  const historyRequestIdRef = useRef(0)
  const userInteractedRef = useRef(false)
  const pendingMessageRef = useRef<{
    userId: string
    conversationId: string
    question: string
    idempotencyKey: string
  } | null>(null)
  const assistantLoading =
    status === 'authenticated' &&
    user?.id !== undefined &&
    assistantLoadingUserId === user.id

  useLayoutEffect(() => {
    const nextUserId =
      status === 'authenticated' ? user?.id ?? null : null
    if (authenticatedUserIdRef.current !== nextUserId) {
      pendingMessageRef.current = null
    }
    authenticatedUserIdRef.current = nextUserId
  }, [status, user?.id])

  useEffect(() => {
    const markUserInteraction = () => {
      userInteractedRef.current = true
    }
    const markScrollKey = (event: KeyboardEvent) => {
      if (
        ['ArrowDown', 'ArrowUp', 'End', 'Home', 'PageDown', 'PageUp', ' '].includes(
          event.key,
        )
      ) {
        markUserInteraction()
      }
    }

    window.addEventListener('wheel', markUserInteraction, { passive: true })
    window.addEventListener('touchstart', markUserInteraction, { passive: true })
    window.addEventListener('pointerdown', markUserInteraction)
    window.addEventListener('keydown', markScrollKey)
    document.addEventListener('focusin', markUserInteraction)

    return () => {
      window.removeEventListener('wheel', markUserInteraction)
      window.removeEventListener('touchstart', markUserInteraction)
      window.removeEventListener('pointerdown', markUserInteraction)
      window.removeEventListener('keydown', markScrollKey)
      document.removeEventListener('focusin', markUserInteraction)
    }
  }, [])

  useEffect(() => {
    let active = true
    const historyRequestId = ++historyRequestIdRef.current

    if (status !== 'authenticated' || !user) {
      void Promise.resolve().then(() => {
        if (!active) return
        setConversations([])
        setActiveConversationId(null)
        setMessages([])
        setQuestion('')
        setAssistantNotice('')
        setHistoryError('')
        setHistoryLoading(false)
        setHistoryOwnerId(null)
      })
      return () => {
        active = false
      }
    }

    setHistoryLoading(true)
    void (async () => {
      try {
        const history = await conversationsApi.list()
        if (!active || historyRequestIdRef.current !== historyRequestId) return
        setHistoryOwnerId(user.id)
        setHistoryError('')
        setConversations(history)
        setActiveConversationId(null)
        setMessages([])
        if (history[0]) {
          const detail = await conversationsApi.get(history[0].id)
          if (!active || historyRequestIdRef.current !== historyRequestId) return
          setActiveConversationId(detail.conversation.id)
          setMessages(detail.messages)
        }
      } catch (error) {
        if (!active || historyRequestIdRef.current !== historyRequestId) return
        setHistoryOwnerId(user.id)
        setConversations([])
        setActiveConversationId(null)
        setMessages([])
        setHistoryError(
          error instanceof Error
            ? error.message
            : 'Conversation history could not be loaded.',
        )
      } finally {
        if (active && historyRequestIdRef.current === historyRequestId) {
          setHistoryLoading(false)
        }
      }
    })()

    return () => {
      active = false
    }
  }, [status, user])

  const visibleConversations =
    status === 'authenticated' && user?.id === historyOwnerId
      ? conversations
      : []
  const visibleMessages =
    status === 'authenticated' && user?.id === historyOwnerId ? messages : []
  const historyPending =
    status === 'authenticated' &&
    (historyLoading || user?.id !== historyOwnerId)

  async function selectConversation(id: string) {
    const requestUserId = authenticatedUserIdRef.current
    if (!requestUserId) return
    const historyRequestId = ++historyRequestIdRef.current

    setHistoryLoading(true)
    setHistoryError('')
    try {
      const detail = await conversationsApi.get(id)
      if (
        authenticatedUserIdRef.current !== requestUserId ||
        historyRequestIdRef.current !== historyRequestId
      ) return
      setActiveConversationId(detail.conversation.id)
      setMessages(detail.messages)
    } catch (error) {
      if (
        authenticatedUserIdRef.current !== requestUserId ||
        historyRequestIdRef.current !== historyRequestId
      ) return
      setHistoryError(
        error instanceof Error
          ? error.message
          : 'Conversation history could not be loaded.',
      )
    } finally {
      if (
        authenticatedUserIdRef.current === requestUserId &&
        historyRequestIdRef.current === historyRequestId
      ) {
        setHistoryLoading(false)
      }
    }
  }

  async function deleteConversation(id: string) {
    const requestUserId = authenticatedUserIdRef.current
    if (!requestUserId) return

    setHistoryError('')
    try {
      await conversationsApi.delete(id)
      if (authenticatedUserIdRef.current !== requestUserId) return
      const remaining = conversations.filter((item) => item.id !== id)
      setConversations(remaining)
      if (activeConversationId === id) {
        setActiveConversationId(null)
        setMessages([])
        if (remaining[0]) {
          await selectConversation(remaining[0].id)
        }
      }
    } catch (error) {
      if (authenticatedUserIdRef.current !== requestUserId) return
      setHistoryError(
        error instanceof Error
          ? error.message
          : 'The conversation could not be deleted.',
      )
    }
  }

  async function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!question.trim()) {
      setAssistantNotice('Enter a general health question to continue.')
      return
    }

    if (status !== 'authenticated' || !user) {
      setAssistantNotice('Sign in to ask a question and save its answer to your history.')
      setAuthOpen(true)
      return
    }

    const requestUserId = user.id
    const submittedQuestion = question.trim()
    setAssistantLoadingUserId(requestUserId)
    setAssistantNotice('')
    try {
      let conversationId =
        historyOwnerId === user.id ? activeConversationId : null
      let conversationCreatedAt = visibleConversations.find(
        (item) => item.id === conversationId,
      )?.created_at
      if (!conversationId) {
        const created = await conversationsApi.create()
        if (authenticatedUserIdRef.current !== requestUserId) return
        conversationId = created.id
        conversationCreatedAt = created.created_at
        setActiveConversationId(created.id)
        setHistoryOwnerId(requestUserId)
        setConversations((current) => [created, ...current])
      }

      const targetConversationId = conversationId
      const pendingMessage = pendingMessageRef.current
      const idempotencyKey =
        pendingMessage?.userId === requestUserId &&
        pendingMessage.question === submittedQuestion &&
        pendingMessage.conversationId === targetConversationId
          ? pendingMessage.idempotencyKey
          : crypto.randomUUID()
      pendingMessageRef.current = {
        userId: requestUserId,
        conversationId: targetConversationId,
        question: submittedQuestion,
        idempotencyKey,
      }
      const result = await conversationsApi.sendMessage(
        targetConversationId,
        submittedQuestion,
        idempotencyKey,
      )
      if (authenticatedUserIdRef.current !== requestUserId) return
      if (pendingMessageRef.current?.idempotencyKey === idempotencyKey) {
        pendingMessageRef.current = null
      }
      setActiveConversationId(targetConversationId)
      setMessages((current) =>
        activeConversationId === targetConversationId &&
        historyOwnerId === user.id
          ? [...current, ...result.messages]
          : result.messages,
      )
      setConversations((current) => {
        const latestMessage = result.messages.at(-1)
        const existing =
          historyOwnerId === user.id ? current : []
        const updated = existing.filter(
          (item) => item.id !== targetConversationId,
        )
        return [
          {
            id: targetConversationId,
            created_at: conversationCreatedAt ?? new Date().toISOString(),
            updated_at: latestMessage?.created_at ?? new Date().toISOString(),
          },
          ...updated,
        ]
      })
      setQuestion('')
    } catch (error) {
      if (authenticatedUserIdRef.current !== requestUserId) return
      setAssistantNotice(
        error instanceof Error
          ? error.message
          : 'The health assistant could not complete this request.',
      )
    } finally {
      setAssistantLoadingUserId((current) =>
        current === requestUserId ? null : current,
      )
    }
  }

  async function submitFacilitySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFacilityLoading(true)
    setFacilityNotice('')
    setFacilities([])
    try {
      const results = await facilitiesApi.search({
        area: facilitySearch,
        type: facilityType,
      })
      setFacilities(results)
      setFacilityNotice(
        results.length === 0
          ? 'No facilities matched this search.'
          : `${results.length} facility result${results.length === 1 ? '' : 's'} found.`,
      )
    } catch (error) {
      setFacilityNotice(
        error instanceof Error
          ? error.message
          : 'Verified facility information is not available right now.',
      )
    } finally {
      setFacilityLoading(false)
    }
  }

  function closeMenu() {
    setMenuOpen(false)
  }

  return (
    <div className="app-shell" id="home">
      <header className="site-header">
        <div className="container nav-layout">
          <a className="brand" href="#home" aria-label="MediGuide AI home">
            <span className="brand-mark">
              <Icon name="plus" size={23} />
            </span>
            <span className="brand-copy">
              <span className="brand-name">MediGuide<span> AI</span></span>
              <span className="brand-tagline">Health, made clearer</span>
            </span>
          </a>

          <button
            className="mobile-menu-toggle"
            type="button"
            aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={menuOpen}
            aria-controls="primary-navigation"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Icon name={menuOpen ? 'close' : 'menu'} />
          </button>

          <nav
            className={`primary-navigation${menuOpen ? ' is-open' : ''}`}
            id="primary-navigation"
            aria-label="Main navigation"
          >
            {navigation.map((item) => (
              <a key={item.href} href={item.href} onClick={closeMenu}>
                {item.label}
              </a>
            ))}
            <a className="nav-cta" href="#assistant" onClick={closeMenu}>
              Get started <Icon name="arrow" size={17} />
            </a>
            <button
              className="nav-cta auth-trigger"
              type="button"
              onClick={() => {
                closeMenu()
                setAuthOpen(true)
              }}
              disabled={status === 'loading'}
            >
              {status === 'authenticated' ? user?.email ?? 'Account' : 'Sign in'}
            </button>
          </nav>
        </div>
      </header>

      <main>
        <section className="hero-section">
          <div className="hero-grid-pattern" aria-hidden="true" />
          <div className="container hero-layout">
            <div className="hero-copy">
              <div className="eyebrow">
                <span className="eyebrow-dot" />
                YOUR HEALTH, YOUR UNDERSTANDING
              </div>
              <h1>
                Understand your health.
                <span> Find your next step.</span>
              </h1>
              <p className="hero-description">
                Clear, trustworthy health education to help you feel more
                informed and prepared for the conversations that matter.
              </p>
              <div className="hero-actions">
                <a className="button button-primary" href="#explore">
                  Explore health topics <Icon name="arrow" size={18} />
                </a>
                <a className="button button-quiet" href="#how-it-works">
                  How it works <Icon name="chevron" size={17} />
                </a>
              </div>
              <div className="hero-trust">
                <span className="trust-icon"><Icon name="shield" size={16} /></span>
                <span>Educational information, not a medical diagnosis.</span>
              </div>
            </div>

            <aside className="hero-visual" aria-label="Assistant preview">
              <div className="visual-orbit orbit-one" />
              <div className="visual-orbit orbit-two" />
              <div className="hero-float-card float-card-top">
                <span className="float-icon"><Icon name="book" size={17} /></span>
                <span><strong>Evidence-led</strong><small>Health education</small></span>
                <Icon name="check" size={17} />
              </div>
              <div className="assistant-preview">
                <div className="preview-topline">
                  <span className="preview-avatar"><Icon name="spark" size={20} /></span>
                  <span><strong>Your health guide</strong><small><i /> Source-grounded assistant</small></span>
                  <span className="preview-menu">•••</span>
                </div>
                <div className="preview-content">
                  <span className="preview-label">A GENTLER WAY TO LEARN</span>
                  <h2>Start with a question.</h2>
                  <p>
                    Explore general health information at your own pace. The
                    assistant answers only when its approved sources support a response.
                  </p>
                  <div className="preview-prompt">
                    <span>What would you like to understand?</span>
                    <span className="prompt-send"><Icon name="arrow" size={16} /></span>
                  </div>
                  <div className="preview-disclaimer">
                    <Icon name="shield" size={14} />
                    <span>Not a diagnosis or substitute for professional care.</span>
                  </div>
                </div>
              </div>
              <div className="hero-float-card float-card-bottom">
                <span className="float-icon calm"><Icon name="heart" size={17} /></span>
                <span><strong>Made for understanding</strong><small>With your wellbeing in mind</small></span>
              </div>
              <span className="visual-spark spark-one">✳</span>
              <span className="visual-spark spark-two">✦</span>
            </aside>
          </div>
          <div className="container hero-bottom">
            <span>BUILT AROUND WHAT MATTERS</span>
            <div><Icon name="shield" size={17} /> Safety first</div>
            <div><Icon name="book" size={17} /> Clear information</div>
            <div><Icon name="heart" size={17} /> People centered</div>
          </div>
        </section>

        <section className="section assistant-section" id="assistant">
          <div className="container assistant-card">
            <div className="assistant-section-copy">
              <span className="section-kicker"><Icon name="spark" size={16} /> YOUR HEALTH ASSISTANT</span>
              <h2>A little more clarity can go a long way.</h2>
              <p>
                Ask general health questions and receive source-grounded
                information when approved evidence is available. The assistant
                abstains when it cannot support an answer.
              </p>
              <div className="availability-pill"><span /> General information only · English responses</div>
            </div>
            <form className="assistant-form" onSubmit={submitQuestion}>
              <label htmlFor="health-question">What would you like to learn about?</label>
              <textarea
                id="health-question"
                value={question}
                onChange={(event) => {
                  setQuestion(event.target.value)
                  setAssistantNotice('')
                }}
                maxLength={2000}
                placeholder="Ask a general health question..."
                rows={3}
              />
              <div className="assistant-form-footer">
                <span><Icon name="shield" size={14} /> {status === 'authenticated' ? 'Saved to your account' : 'Sign in required to ask and save'}</span>
                <button
                  className="button button-primary"
                  type="submit"
                  disabled={
                    assistantLoading ||
                    status === 'loading' ||
                    (status === 'authenticated' && historyPending)
                  }
                >
                  {assistantLoading ? 'Finding sources…' : 'Ask MediGuide'}
                  {!assistantLoading && <Icon name="arrow" size={17} />}
                </button>
              </div>
              {assistantNotice && <p className="inline-notice" role="status">{assistantNotice}</p>}
            </form>
            <div
              className="conversation-thread"
              aria-live="polite"
              aria-busy={assistantLoading}
            >
              {historyPending && <p className="conversation-status">Loading your conversation…</p>}
              {visibleMessages.map((message) => (
                <article className={`conversation-message conversation-message-${message.role}`} key={message.id}>
                  <span className="conversation-role">
                    {message.role === 'assistant' ? 'MediGuide AI' : 'You'}
                  </span>
                  <p>{message.content}</p>
                  {message.citations.length > 0 && (
                    <div className="message-citations">
                      <strong>Sources</strong>
                      <ul>
                        {message.citations.map((citation) => (
                          <li key={`${citation.sourceId}-${citation.url}`}>
                            <a href={citation.url} target="_blank" rel="noreferrer">
                              {citation.title}
                            </a>
                            <span>{citation.publisher}{citation.section ? ` · ${citation.section}` : ''}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {message.role === 'assistant' && message.limitations.length > 0 && (
                    <p className="message-limitations">
                      Limitations: {message.limitations.join(' ')}
                    </p>
                  )}
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section explore-section" id="explore">
          <div className="container">
            <div className="section-heading">
              <div>
                <span className="section-kicker">A PLACE TO BEGIN</span>
                <h2>Explore health information</h2>
                <p>
                  Thoughtful learning experiences are on the way. We’ll only
                  share health content when its sources and review status are
                  clear.
                </p>
              </div>
              <span className="coming-label"><Icon name="clock" size={15} /> Library in development</span>
            </div>
            <div className="feature-grid">
              {healthFeatures.map((feature, index) => (
                <article className={`feature-card feature-card-${index + 1}`} key={feature.title}>
                  <div className="feature-card-top">
                    <span className="feature-card-icon"><Icon name={feature.icon} size={22} /></span>
                    <span className="feature-label">{feature.label}</span>
                  </div>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                  <button
                    className="feature-link"
                    type="button"
                    aria-expanded={expandedFeature === feature.title}
                    onClick={() => setExpandedFeature((current) => current === feature.title ? null : feature.title)}
                  >
                    {expandedFeature === feature.title ? 'Hide details' : 'Explore this area'}
                    <Icon name="arrow" size={16} />
                  </button>
                  {expandedFeature === feature.title && (
                    <div className="feature-detail" role="status">
                      <Icon name="clock" size={15} /> {feature.status}. No health articles are available here yet.
                    </div>
                  )}
                  <span className="feature-watermark"><Icon name={feature.icon} size={88} /></span>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section facilities-section" id="facilities">
          <div className="container facilities-layout">
            <div className="facilities-copy">
              <span className="section-kicker"><Icon name="pin" size={16} /> CARE, CLOSER TO YOU</span>
              <h2>Find care in your community.</h2>
              <p>
                Search for facilities when verified directory data is
                connected. Unverified addresses, services, and contact details
                are never presented as confirmed.
              </p>
              <a className="text-link" href="#emergency">
                Need urgent help? See emergency information <Icon name="arrow" size={16} />
              </a>
            </div>
            <div className="facility-search-card">
              <div className="facility-card-heading">
                <span className="facility-icon"><Icon name="pin" size={21} /></span>
                <div><h3>Healthcare facilities</h3><p>Search provider-verified information</p></div>
              </div>
              <form className="facility-form" onSubmit={submitFacilitySearch}>
                <label htmlFor="facility-location">City or area</label>
                <div className="facility-input-wrap">
                  <Icon name="search" size={18} />
                  <input
                    id="facility-location"
                    value={facilitySearch}
                    onChange={(event) => {
                      setFacilitySearch(event.target.value)
                      setFacilityNotice('')
                    }}
                    placeholder="e.g. Addis Ababa"
                  />
                </div>
                <label htmlFor="facility-type">Facility type</label>
                <select
                  id="facility-type"
                  value={facilityType}
                  onChange={(event) => setFacilityType(event.target.value)}
                >
                  <option value="">All types</option>
                  <option value="hospital">Hospital</option>
                  <option value="health_center">Health center</option>
                  <option value="clinic">Clinic</option>
                  <option value="other">Other</option>
                </select>
                <button
                  className="button button-primary"
                  type="submit"
                  disabled={facilityLoading}
                >
                  {facilityLoading ? 'Searching…' : 'Search facilities'}
                  {!facilityLoading && <Icon name="arrow" size={17} />}
                </button>
              </form>
              <div className="facility-status" role="status">
                <span className="status-dot" />
                {facilityNotice || 'No verified facility dataset is connected.'}
              </div>
              {facilities.map((facility) => (
                <article className="facility-result" key={facility.id}>
                  <div className="facility-result-heading">
                    <h4>{facility.name}</h4>
                    <span className={`facility-verification facility-verification-${facility.verificationStatus}`}>
                      {facility.verificationStatus === 'verified'
                        ? `Verified${facility.verifiedAt ? ` · ${facility.verifiedAt}` : ''}`
                        : facility.verificationStatus === 'outdated'
                          ? 'Verification may be outdated'
                          : 'Unverified information'}
                    </span>
                  </div>
                  <p>{facility.address}{facility.area ? ` · ${facility.area}` : ''}</p>
                  <p>{facility.phone ?? 'Phone number not verified'} · {facility.type.replaceAll('_', ' ')}</p>
                  <div className="facility-result-links">
                    {facility.sourceUrl && (
                      <a href={facility.sourceUrl} target="_blank" rel="noreferrer">
                        Source
                      </a>
                    )}
                    {facility.mapUrl && (
                      <a href={facility.mapUrl} target="_blank" rel="noreferrer">
                        Map
                      </a>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section history-section" id="history">
          <div className="container history-card">
            <div className="history-icon"><Icon name="clock" size={24} /></div>
            <div className="history-copy">
              <span className="section-kicker">YOUR SPACE</span>
              <h2>Your health history, when you’re ready.</h2>
              <p>
                Your conversations are private to your account. You can reopen
                or delete any saved conversation here.
              </p>
            </div>
            <div className="history-list">
              {              status === 'authenticated' && visibleConversations.length > 0 ? (
                visibleConversations.map((item, index) => (
                  <div
                    className={`history-item${item.id === activeConversationId ? ' is-active' : ''}`}
                    key={item.id}
                  >
                    <button
                      type="button"
                      className="history-select"
                      onClick={() => void selectConversation(item.id)}
                      aria-current={item.id === activeConversationId ? 'true' : undefined}
                    >
                      <strong>Conversation {visibleConversations.length - index}</strong>
                      <span>{new Date(item.updated_at).toLocaleString()}</span>
                    </button>
                    <button
                      type="button"
                      className="history-delete"
                      aria-label={`Delete conversation ${visibleConversations.length - index}`}
                      onClick={() => void deleteConversation(item.id)}
                    >
                      <Icon name="close" size={16} />
                    </button>
                  </div>
                ))
              ) : (
                <div className="history-empty">
                  <span className="empty-icon"><Icon name="calendar" size={21} /></span>
                  <strong>
                    {status === 'authenticated'
                      ? historyPending ? 'Loading conversations…' : 'No saved conversations'
                      : 'Sign in to keep your history'}
                  </strong>
                  <span>
                    {status === 'authenticated'
                      ? 'Ask the assistant to start a conversation.'
                      : 'Only your account can access its saved conversations.'}
                  </span>
                </div>
              )}
              {historyError && user?.id === historyOwnerId && <p className="inline-notice" role="alert">{historyError}</p>}
            </div>
          </div>
        </section>

        <section className="section emergency-section" id="emergency">
          <div className="container emergency-card">
            <div className="emergency-symbol"><Icon name="heart" size={23} /></div>
            <div className="emergency-copy">
              <span className="emergency-kicker">IMPORTANT TO KNOW</span>
              <h2>In an emergency, get help now.</h2>
              <p>
                MediGuide AI does not provide emergency care or assess urgent
                symptoms. If you believe someone may be in immediate danger,
                contact local emergency services or go to the nearest
                emergency department. Do not wait for this app.
              </p>
              <span className="emergency-review"><Icon name="shield" size={15} /> General information · Not a clinical triage tool</span>
            </div>
            <div className="emergency-art" aria-hidden="true">
              <span className="emergency-art-circle"><Icon name="heart" size={60} /></span>
              <span className="emergency-art-dot dot-a" />
              <span className="emergency-art-dot dot-b" />
            </div>
          </div>
        </section>

        <section className="section closing-section" id="how-it-works">
          <div className="container closing-card">
            <span className="closing-symbol"><Icon name="sun" size={22} /></span>
            <span className="section-kicker">UNDERSTANDING IS A GOOD FIRST STEP</span>
            <h2>Health information should help you feel more prepared.</h2>
            <p>
              We’re building MediGuide AI carefully, with clear limits,
              transparent sources, and respect for the people who use it.
            </p>
            <a className="button button-primary" href="#assistant">
              Meet the assistant <Icon name="arrow" size={17} />
            </a>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container footer-main">
          <a className="brand footer-brand" href="#home" aria-label="MediGuide AI home">
            <span className="brand-mark"><Icon name="plus" size={22} /></span>
            <span className="brand-copy">
              <span className="brand-name">MediGuide<span> AI</span></span>
              <span className="brand-tagline">Understand your health. Find your next step.</span>
            </span>
          </a>
          <div className="footer-links">
            {navigation.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}
          </div>
        </div>
        <div className="container footer-bottom">
          <span>© {new Date().getFullYear()} MediGuide AI</span>
          <span>Educational prototype · Not clinically validated</span>
        </div>
      </footer>

      <button
        className="floating-assistant"
        type="button"
        aria-label="Open AI assistant"
        aria-expanded={assistantOpen}
        onClick={() => setAssistantOpen(true)}
      >
        <Icon name="chat" size={22} />
        <span>Ask MediGuide</span>
      </button>

      {assistantOpen && (
        <div className="assistant-dialog-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setAssistantOpen(false)
        }}>
          <section
            className="assistant-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
          >
            <button
              className="dialog-close"
              type="button"
              aria-label="Close assistant"
              onClick={() => setAssistantOpen(false)}
            >
              <Icon name="close" size={20} />
            </button>
            <span className="dialog-icon"><Icon name="spark" size={23} /></span>
            <span className="section-kicker">MEDIGUIDE AI</span>
            <h2 id="dialog-title">Ask for source-grounded health information.</h2>
            <p>
              Sign in to submit a general health question and save its response
              and citations to your private conversation history.
            </p>
            <a className="button button-primary dialog-action" href="#assistant" onClick={() => setAssistantOpen(false)}>
              Learn about the assistant <Icon name="arrow" size={17} />
            </a>
          </section>
        </div>
      )}
      {authOpen && <AuthDialog onClose={() => setAuthOpen(false)} />}
    </div>
  )
}

export default App
