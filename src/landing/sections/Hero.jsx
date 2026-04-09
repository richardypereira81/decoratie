import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import { normalizeMultilineText } from '../../shared/formatters.js'
import Plate3D from '../components/Plate3D.jsx'

const Arrow = () => (
  <svg className="btn-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
)

export default function Hero({ content }) {
  const ref = useRef(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end start'],
  })

  const visualY = useTransform(scrollYProgress, [0, 1], [0, 120])
  const textY = useTransform(scrollYProgress, [0, 1], [0, 60])
  const opacity = useTransform(scrollYProgress, [0, 0.7], [1, 0])
  const titleLines = normalizeMultilineText(content.heroTitle)
  const displayLines = titleLines.length ? titleLines : ['Sua mesa nunca mais será comum.']

  return (
    <section id="top" className="hero" ref={ref}>
      <div className="container hero-grid">
        <motion.div className="hero-text" style={{ y: textY, opacity }}>
          <motion.span
            className="eyebrow"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            Decoratie · Mesa Posta
          </motion.span>

          <h1 className="hero-headline h-display">
            {displayLines.map((line, index) => (
              <span key={index} style={{ display: 'block', overflow: 'hidden' }}>
                <motion.span
                  style={{ display: 'inline-block' }}
                  initial={{ y: '110%' }}
                  animate={{ y: '0%' }}
                  transition={{
                    duration: 1.1,
                    delay: 0.5 + index * 0.12,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                >
                  {line}
                </motion.span>
              </span>
            ))}
          </h1>

          <motion.p
            className="hero-sub"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 1, ease: [0.16, 1, 0.3, 1] }}
          >
            {content.heroSubtitle}
          </motion.p>

          <motion.div
            className="hero-cta-row"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 1.15, ease: [0.16, 1, 0.3, 1] }}
          >
            <a href="#contato" className="btn btn-primary">
              {content.ctaText || 'Quero transformar minha mesa'} <Arrow />
            </a>
            <a href="#colecao" className="btn btn-ghost">
              Ver coleção
            </a>
          </motion.div>

          <motion.div
            className="hero-meta"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 1.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="hero-meta-item">
              <span className="hero-meta-num">+2.400</span>
              <span className="hero-meta-label">Mesas transformadas</span>
            </div>
            <div className="hero-meta-item">
              <span className="hero-meta-num">98%</span>
              <span className="hero-meta-label">Clientes apaixonadas</span>
            </div>
            <div className="hero-meta-item">
              <span className="hero-meta-num">Único</span>
              <span className="hero-meta-label">Peças limitadas</span>
            </div>
          </motion.div>
        </motion.div>

        <motion.div className="hero-visual" style={{ y: visualY }}>
          <div className="hero-glow" />
          <div className="hero-frame" />
          <div className="hero-canvas-wrap">
            <Plate3D />
            {content.heroImage ? (
              <motion.div
                className="hero-admin-shot"
                initial={{ opacity: 0, rotate: -10, scale: 0.92 }}
                animate={{ opacity: 1, rotate: -7, scale: 1 }}
                transition={{ duration: 0.9, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
              >
                <img
                  src={content.heroImage}
                  alt="Coleção Decoratie em destaque"
                  decoding="async"
                />
              </motion.div>
            ) : null}
          </div>
        </motion.div>
      </div>

      <motion.div
        className="hero-scroll"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 1.6 }}
      >
        <span>Role para descobrir</span>
        <div className="hero-scroll-line" />
      </motion.div>
    </section>
  )
}
