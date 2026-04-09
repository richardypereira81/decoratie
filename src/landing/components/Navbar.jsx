import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

const NAV_LINKS = [
  { href: '#colecao', label: 'Coleção' },
  { href: '#historia', label: 'História' },
  { href: '#exclusivo', label: 'Exclusivo' },
  { href: '#depoimentos', label: 'Depoimentos' },
]

export default function Navbar({ settings }) {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    document.body.classList.toggle('landing-nav-open', menuOpen)

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        setMenuOpen(false)
      }
    }

    if (menuOpen) {
      window.addEventListener('keydown', onKeyDown)
    }

    return () => {
      document.body.classList.remove('landing-nav-open')
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  function closeMenu() {
    setMenuOpen(false)
  }

  return (
    <>
      <motion.nav
        className={`nav ${scrolled ? 'scrolled' : ''} ${menuOpen ? 'is-open' : ''}`}
        initial={{ y: -30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
      >
        <div className="nav-shell">
          <a href="#top" className="nav-logo" onClick={closeMenu}>
            Decora<span>tie</span>
          </a>

          <div className="nav-links" aria-label="Navegação principal">
            {NAV_LINKS.map((link) => (
              <a key={link.href} href={link.href}>
                {link.label}
              </a>
            ))}
          </div>

          <a href="#contato" className="btn btn-primary nav-cta">
            {settings.ctaDefaultText || 'Quero conhecer'}
          </a>

          <button
            type="button"
            className="nav-toggle"
            aria-expanded={menuOpen}
            aria-controls="landing-navigation"
            aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
            onClick={() => setMenuOpen((current) => !current)}
          >
            <span className="nav-toggle-line" />
            <span className="nav-toggle-line" />
            <span className="nav-toggle-line" />
          </button>
        </div>
      </motion.nav>

      <div
        className={`nav-drawer-backdrop ${menuOpen ? 'is-visible' : ''}`}
        aria-hidden={!menuOpen}
        onClick={closeMenu}
      />

      <div
        id="landing-navigation"
        className={`nav-drawer ${menuOpen ? 'is-open' : ''}`}
        aria-hidden={!menuOpen}
      >
        <div className="nav-drawer-inner" data-lenis-prevent>
          <span className="nav-drawer-label">Navegação</span>
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="nav-drawer-link"
              onClick={closeMenu}
            >
              {link.label}
            </a>
          ))}

          <a
            href="#contato"
            className="btn btn-primary nav-drawer-cta"
            onClick={closeMenu}
          >
            {settings.ctaDefaultText || 'Quero conhecer'}
          </a>
        </div>
      </div>
    </>
  )
}
