import { useEffect, useState } from 'react'
import { getEducationTopics } from './api'
import type { EducationTopic } from './api'
import './App.css'

type Language = 'English' | 'አማርኛ'

const content = {
  English: {
    caption: 'HEALTH EDUCATION, MADE CLEAR',
    navAction: 'Explore health topics',
    eyebrow: 'YOUR HEALTH, YOUR UNDERSTANDING',
    titleStart: 'Understand your health.',
    titleEnd: 'Find your next step.',
    description:
      'Explore clear, accessible health information to help you understand common health topics and prepare for informed conversations with qualified health professionals.',
    primaryAction: 'Explore health topics',
    secondaryAction: 'How it works',
    reassurance: 'General health education, not a medical diagnosis.',
    cardTitle: 'A clearer path to health information',
    cardDescription:
      'Start with reliable educational guidance and understand when professional care may be needed.',
    features: [
      {
        icon: '✳',
        title: 'Understand health topics',
        description:
          'Learn about common symptoms, conditions, prevention, and general wellness.',
      },
      {
        icon: '⌕',
        title: 'Know what to ask',
        description:
          'Prepare questions that can help you have more informed conversations with a health professional.',
      },
      {
        icon: '♡',
        title: 'Keep safety in focus',
        description:
          'Understand the limits of online health information and when to seek professional help.',
      },
    ],
    safetyTitle: 'Important health and safety information',
    safetyDescription:
      'MediGuide AI is being developed as a health education tool. It does not diagnose conditions, replace a qualified health professional, or provide emergency care. If you think you may be experiencing a medical emergency, seek urgent local medical assistance.',
    topicsEyebrow: 'A PLACE TO START',
    topicsTitle: 'Explore health education',
    topicsDescription:
      'Choose a topic to learn about general health information. These sections are introductory and do not provide personal medical advice.',
    topics: [
      {
        title: 'Everyday wellness',
        description:
          'Explore general information about sleep, hydration, nutrition, and healthy routines.',
        icon: '☀',
      },
      {
        title: 'Understanding symptoms',
        description:
          'Learn how symptoms are described and why the same symptom can have different causes.',
        icon: '⌕',
      },
      {
        title: 'Preventive health',
        description:
          'Discover general information about hygiene, prevention, and routine health checks.',
        icon: '＋',
      },
    ],
    howTitle: 'Health information should help you take informed next steps.',
    howDescription:
      'Our goal is to make health education easier to understand, with transparent limitations and an emphasis on trustworthy sources.',
    footer:
      'MediGuide AI is an educational project in development. Its health guidance has not yet been clinically validated.',
    languageLabel: 'Language',
    unavailableTitle: 'AI health assistance is not connected yet',
    unavailableDescription:
      'The website interface is under development. No AI health assessment or personalized medical guidance is available yet.',
    close: 'Close',
    retry: 'Try again',
    loadingTopics: 'Loading health education topics...',
    topicsError:
      'Health education topics could not be loaded. Please check your connection and try again.',
    emptyTopics: 'No health education topics are available right now.',
  },
  'አማርኛ': {
    caption: 'የጤና ትምህርት በቀላሉ',
    navAction: 'የጤና ርዕሶችን ይመልከቱ',
    eyebrow: 'ጤናዎን ይረዱ',
    titleStart: 'ጤናዎን ይረዱ።',
    titleEnd: 'ቀጣዩን እርምጃ ይወቁ።',
    description:
      'ስለ ጤና ጉዳዮች በቀላሉ የተገለጸ መረጃ ያግኙ። ይህ መረጃ ከባለሙያ ጋር ለሚያደርጉት ውይይት እንዲዘጋጁ ይረዳዎታል።',
    primaryAction: 'የጤና ርዕሶችን ይመልከቱ',
    secondaryAction: 'አሰራሩን ይወቁ',
    reassurance: 'አጠቃላይ የጤና ትምህርት ነው፤ የሕክምና ምርመራ አይደለም።',
    cardTitle: 'የጤና መረጃን በቀላሉ ይረዱ',
    cardDescription:
      'አጠቃላይ የጤና መረጃን ይጀምሩ፤ የባለሙያ እርዳታ መቼ ሊያስፈልግ እንደሚችልም ይረዱ።',
    features: [
      {
        icon: '✳',
        title: 'ስለ ጤና ይማሩ',
        description: 'ስለ የተለመዱ የጤና ጉዳዮች፣ መከላከል እና ጤናማ አኗኗር ይማሩ።',
      },
      {
        icon: '⌕',
        title: 'የሚጠይቁትን ይወቁ',
        description: 'ከጤና ባለሙያ ጋር ለሚያደርጉት ውይይት ጥያቄዎችን ያዘጋጁ።',
      },
      {
        icon: '♡',
        title: 'ደህንነትን ያስቀድሙ',
        description: 'የመስመር ላይ የጤና መረጃ ውስንነቶችን ይረዱ።',
      },
    ],
    safetyTitle: 'አስፈላጊ የጤና ደህንነት መረጃ',
    safetyDescription:
      'MediGuide AI እንደ የጤና ትምህርት መሣሪያ እየተዘጋጀ ነው። የሕክምና ምርመራን፣ የባለሙያ እርዳታን ወይም የድንገተኛ ሕክምናን አይተካም። ድንገተኛ የጤና ችግር እንዳለ ከጠረጠሩ አስቸኳይ የሕክምና እርዳታ ይፈልጉ።',
    topicsEyebrow: 'ከዚህ ይጀምሩ',
    topicsTitle: 'የጤና ትምህርትን ይመልከቱ',
    topicsDescription:
      'ስለ አጠቃላይ የጤና መረጃ ለመማር አንድ ርዕስ ይምረጡ። እነዚህ ርዕሶች የግል የሕክምና ምክር አይሰጡም።',
    topics: [
      {
        title: 'ዕለታዊ ጤና',
        description: 'ስለ እንቅልፍ፣ ውሃ፣ ምግብ እና ጤናማ የዕለት ተዕለት ልምዶች ይማሩ።',
        icon: '☀',
      },
      {
        title: 'ምልክቶችን መረዳት',
        description: 'የጤና ምልክቶች ለምን የተለያዩ ምክንያቶች ሊኖሯቸው እንደሚችል ይማሩ።',
        icon: '⌕',
      },
      {
        title: 'የጤና መከላከል',
        description: 'ስለ ንጽህና፣ መከላከል እና መደበኛ የጤና ምርመራ ይማሩ።',
        icon: '＋',
      },
    ],
    howTitle: 'የጤና መረጃ ትክክለኛ ቀጣይ እርምጃ እንዲወስዱ ሊረዳዎት ይገባል።',
    howDescription:
      'ዓላማችን የጤና ትምህርትን በቀላሉ ማቅረብ፣ ውስንነቶቹን በግልጽ ማሳየት እና ታማኝ ምንጮችን ማስቀደም ነው።',
    footer:
      'MediGuide AI እየተዘጋጀ ያለ የትምህርት ፕሮጀክት ነው። የጤና መመሪያው በክሊኒካዊ ግምገማ ገና አልተረጋገጠም።',
    languageLabel: 'ቋንቋ',
    unavailableTitle: 'የAI የጤና እገዛ ገና አልተገናኘም',
    unavailableDescription:
      'የድረ-ገጹ ክፍል እየተዘጋጀ ነው። የAI የጤና ግምገማ ወይም የግል የሕክምና መመሪያ እስካሁን አይገኝም።',
    close: 'ዝጋ',
    retry: 'እንደገና ይሞክሩ',
    loadingTopics: 'የጤና ትምህርት ርዕሶች በመጫን ላይ ናቸው...',
    topicsError: 'የጤና ርዕሶችን መጫን አልተቻለም። የኢንተርኔት ግንኙነትዎን ይፈትሹና እንደገና ይሞክሩ።',
    emptyTopics: 'በአሁኑ ጊዜ የጤና ትምህርት ርዕሶች የሉም።',
  },
} as const

function App() {
  const [language, setLanguage] = useState<Language>('English')
  const [showNotice, setShowNotice] = useState(false)
  const [educationTopics, setEducationTopics] = useState<EducationTopic[]>([])
  const [educationDisclaimer, setEducationDisclaimer] = useState('')
  const [topicsLoading, setTopicsLoading] = useState(true)
  const [topicsError, setTopicsError] = useState(false)
  const [topicsRetryCount, setTopicsRetryCount] = useState(0)

  useEffect(() => {
    let active = true

    setTopicsLoading(true)
    setTopicsError(false)

    getEducationTopics()
      .then((data) => {
        if (active) {
          setEducationTopics(data.topics)
          setEducationDisclaimer(data.disclaimer)
        }
      })
      .catch(() => {
        if (active) {
          setTopicsError(true)
        }
      })
      .finally(() => {
        if (active) {
          setTopicsLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [topicsRetryCount])

  const text = content[language]

  const scrollToTopics = () => {
    document.getElementById('health-topics')?.scrollIntoView({
      behavior: 'smooth',
    })
  }

  return (
    <div className="app">
      <header className="site-header">
        <nav className="container navbar" aria-label="Main navigation">
          <a className="brand" href="#home" aria-label="MediGuide AI home">
            <span className="brand-mark" aria-hidden="true">
              +
            </span>
            <span>
              <span className="brand-name">MediGuide AI</span>
              <span className="brand-caption">{text.caption}</span>
            </span>
          </a>

          <div className="nav-actions">
            <label className="sr-only" htmlFor="language">
              {text.languageLabel}
            </label>
            <select
              id="language"
              className="language-select"
              value={language}
              onChange={(event) =>
                setLanguage(event.target.value as Language)
              }
              aria-label={text.languageLabel}
            >
              <option value="English">English</option>
              <option value="አማርኛ">አማርኛ</option>
            </select>
            <button
              className="button button-primary"
              type="button"
              onClick={scrollToTopics}
            >
              {text.navAction}
            </button>
          </div>
        </nav>
      </header>

      <main id="home">
        <section className="hero-section">
          <div className="container hero-grid">
            <div>
              <span className="eyebrow">{text.eyebrow}</span>
              <h1 className="hero-title">
                {text.titleStart} <span>{text.titleEnd}</span>
              </h1>
              <p className="hero-description">{text.description}</p>

              <div className="hero-actions">
                <button
                  className="button button-primary"
                  type="button"
                  onClick={scrollToTopics}
                >
                  {text.primaryAction} <span aria-hidden="true">→</span>
                </button>
                <a className="button button-secondary" href="#how-it-works">
                  {text.secondaryAction}
                </a>
              </div>

              <p className="hero-note">
                <span aria-hidden="true">ⓘ </span>
                {text.reassurance}
              </p>
            </div>

            <aside className="info-card" aria-labelledby="intro-card-title">
              <span className="eyebrow">MEDIGUIDE AI</span>
              <h2 id="intro-card-title">{text.cardTitle}</h2>
              <p>{text.cardDescription}</p>

              <div className="feature-list">
                {text.features.map((feature) => (
                  <div className="feature-item" key={feature.title}>
                    <span className="feature-icon" aria-hidden="true">
                      {feature.icon}
                    </span>
                    <div>
                      <h3>{feature.title}</h3>
                      <p>{feature.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </section>

        <section className="container" aria-labelledby="safety-title">
          <div className="safety-notice">
            <span className="safety-notice-icon" aria-hidden="true">
              ⚠
            </span>
            <div>
              <h2 id="safety-title">{text.safetyTitle}</h2>
              <p>{text.safetyDescription}</p>
            </div>
          </div>
        </section>

        <section
          className="section"
          id="health-topics"
          aria-labelledby="topics-title"
        >
          <div className="container">
            <div className="section-heading">
              <span className="eyebrow">{text.topicsEyebrow}</span>
              <h2 id="topics-title">{text.topicsTitle}</h2>
              <p>{text.topicsDescription}</p>
            </div>

            <div className="topic-grid">
              {topicsLoading ? (
                <p role="status">{text.loadingTopics}</p>
              ) : topicsError ? (
                <div role="alert">
                  <p>{text.topicsError}</p>
                  <button
                    className="button button-primary"
                    type="button"
                    onClick={() => setTopicsRetryCount((count) => count + 1)}
                  >
                    {text.retry}
                  </button>
                </div>
              ) : educationTopics.length === 0 ? (
                <p>{text.emptyTopics}</p>
              ) : (
                educationTopics.map((topic) => (
                  <article className="topic-card" key={topic.id}>
                    <h3>{topic.title}</h3>
                    <p>{topic.summary}</p>
                    <p>{topic.guidance}</p>
                  </article>
                ))
              )}
            </div>

            {!topicsLoading && !topicsError && educationDisclaimer && (
              <p className="topic-disclaimer" role="note">
                {educationDisclaimer}
              </p>
            )}
          </div>
        </section>

        <section className="section how-section" id="how-it-works">
          <div className="container how-content">
            <span className="eyebrow">{text.caption}</span>
            <h2>{text.howTitle}</h2>
            <p>{text.howDescription}</p>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container footer-content">
          <a className="brand" href="#home">
            <span className="brand-mark" aria-hidden="true">
              +
            </span>
            <span className="brand-name">MediGuide AI</span>
          </a>
          <p>{text.footer}</p>
        </div>
      </footer>

      {showNotice && (
        <div
          className="modal-backdrop"
          onClick={() => setShowNotice(false)}
        >
          <section
            className="notice-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="notice-title"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="feature-icon" aria-hidden="true">
              ℹ
            </span>
            <h2 id="notice-title">{text.unavailableTitle}</h2>
            <p>{text.unavailableDescription}</p>
            <button
              className="button button-primary"
              type="button"
              onClick={() => setShowNotice(false)}
            >
              {text.close}
            </button>
          </section>
        </div>
      )}
    </div>
  )
}

export default App