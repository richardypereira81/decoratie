import Reveal from '../components/Reveal.jsx'

const WhatsAppIcon = () => (
  <svg className="cta-icon" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.6 6.32A8.78 8.78 0 0 0 11.5 3.8a8.78 8.78 0 0 0-7.6 13.16L3 21.2l4.36-1.14a8.78 8.78 0 0 0 4.14 1.05h.01a8.78 8.78 0 0 0 8.78-8.78 8.73 8.73 0 0 0-2.69-6.01zm-6.1 13.5h-.01a7.3 7.3 0 0 1-3.72-1.02l-.27-.16-2.59.68.69-2.52-.17-.27a7.3 7.3 0 1 1 13.55-3.85 7.3 7.3 0 0 1-7.48 7.14zm4-5.47c-.22-.11-1.3-.64-1.5-.71-.2-.07-.35-.11-.5.11s-.57.71-.7.86c-.13.15-.26.16-.48.05-.22-.11-.93-.34-1.78-1.09-.66-.59-1.1-1.32-1.23-1.54-.13-.22-.01-.34.1-.45.1-.1.22-.26.33-.39.11-.13.15-.22.22-.37.07-.15.04-.28-.02-.39-.06-.11-.5-1.2-.68-1.65-.18-.43-.36-.37-.5-.38h-.43c-.15 0-.39.06-.6.28-.2.22-.79.77-.79 1.88 0 1.11.81 2.18.92 2.33.11.15 1.59 2.43 3.86 3.41.54.23.96.37 1.29.48.54.17 1.03.15 1.42.09.43-.06 1.3-.53 1.49-1.04.18-.51.18-.95.13-1.04-.05-.09-.2-.15-.42-.26z" />
  </svg>
)

const InstagramIcon = () => (
  <svg className="cta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
  </svg>
)

const GroupIcon = () => (
  <svg className="cta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)

export default function CTASection({ content, settings }) {
  return (
    <section id="contato" className="cta-section">
      <div className="container">
        <div className="cta-inner">
          <Reveal>
            <span className="eyebrow" style={{ display: 'inline-flex' }}>
              Entre agora
            </span>
          </Reveal>
          <Reveal>
            <h2 className="cta-title">{content.ctaTitle}</h2>
          </Reveal>
          <Reveal>
            <p className="cta-sub">{content.ctaSubtitle}</p>
          </Reveal>
          {settings.systemStatus !== 'online' ? (
            <Reveal>
              <div className="cta-status">Status atual do atendimento: {settings.systemStatus}</div>
            </Reveal>
          ) : null}
          <Reveal stagger className="cta-buttons">
            <a className="cta-btn cta-btn-wa" href={settings.whatsappLink} target="_blank" rel="noreferrer">
              <WhatsAppIcon /> Falar no WhatsApp
            </a>
            <a className="cta-btn cta-btn-ig" href={settings.instagramLink} target="_blank" rel="noreferrer">
              <InstagramIcon /> Instagram
            </a>
            <a className="cta-btn cta-btn-group" href={settings.vipGroupLink || '#'} target="_blank" rel="noreferrer">
              <GroupIcon /> Entrar no grupo VIP
            </a>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
