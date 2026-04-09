import { motion, useScroll, useTransform } from 'framer-motion'
import { useRef } from 'react'
import Reveal from '../components/Reveal.jsx'

export default function Emotional({ content }) {
  const ref = useRef(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  })
  const imgScale = useTransform(scrollYProgress, [0, 1], [1, 1.08])
  const imgY = useTransform(scrollYProgress, [0, 1], [40, -40])

  const lines = ['Não é sobre louças.', 'É sobre quem senta', 'à mesa com você.']

  return (
    <section id="historia" className="emotional" ref={ref}>
      <div className="container emotional-grid">
        <div>
          <Reveal>
            <span className="eyebrow" style={{ marginBottom: 28, display: 'inline-flex' }}>
              A nossa filosofia
            </span>
          </Reveal>

          <h2 className="emotional-quote">
            {lines.map((line, index) => (
              <span key={index} className="reveal-line">
                <motion.span
                  initial={{ y: '110%' }}
                  whileInView={{ y: '0%' }}
                  viewport={{ once: true, amount: 0.6 }}
                  transition={{
                    duration: 1.1,
                    delay: index * 0.12,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                >
                  {index === 2 ? (
                    <>
                      à mesa <em>com você.</em>
                    </>
                  ) : (
                    line
                  )}
                </motion.span>
              </span>
            ))}
          </h2>

          <Reveal>
            <p className="emotional-body">{content.emotionalText}</p>
          </Reveal>
        </div>

        <motion.div
          className={`emotional-image ${content.emotionalImage ? 'has-image' : ''}`}
          style={{
            scale: imgScale,
            y: imgY,
          }}
        >
          {content.emotionalImage ? (
            <img
              className="emotional-photo"
              src={content.emotionalImage}
              alt="Curadoria Decoratie em destaque"
              loading="lazy"
              decoding="async"
            />
          ) : null}
          <div className="emotional-image-overlay" />
          <div className="emotional-image-inner">
            {content.emotionalImage ? null : 'Composição refinada'}
          </div>
        </motion.div>
      </div>
    </section>
  )
}
