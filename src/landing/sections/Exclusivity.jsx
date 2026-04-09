import { motion } from 'framer-motion'
import { exclusivityPerks } from '../../data/siteDefaults.js'
import { normalizeMultilineText } from '../../shared/formatters.js'
import Reveal from '../components/Reveal.jsx'

export default function Exclusivity({ content, settings }) {
  const titleLines = normalizeMultilineText(content.exclusivityTitle)
  const displayLines = titleLines.length ? titleLines : ['Peças limitadas.', 'Estoques que não voltam.']
  const remaining = Number(content.exclusivityRemaining) || 0
  const total = Number(content.exclusivityTotal) || 0
  const progress = total ? Math.min(100, Math.max(0, (remaining / total) * 100)) : 0

  return (
    <section id="exclusivo" className="exclusivity">
      <div className="container exclusivity-grid">
        <div>
          <Reveal>
            <span className="eyebrow">Acesso restrito</span>
          </Reveal>
          <Reveal>
            <h2 className="exclusivity-title">
              {displayLines.map((line, index) => (
                <span key={line} style={{ display: 'block' }}>
                  {line}
                  {index < displayLines.length - 1 ? <br /> : null}
                </span>
              ))}
            </h2>
          </Reveal>
          <Reveal>
            <p className="exclusivity-text">{content.exclusivityText}</p>
          </Reveal>
          <Reveal>
            <a href={settings.vipGroupLink || '#'} className="btn btn-primary" target="_blank" rel="noreferrer">
              Entrar no grupo VIP
            </a>
          </Reveal>
        </div>

        <Reveal>
          <div className="exclusivity-card">
            <div className="badge-premium">Edição Atual</div>

            <div className="stock-row">
              <span className="stock-label">{content.exclusivityCollection || 'Coleção atual'}</span>
              <div className="stock-num">
                {remaining} <small>de {total} peças</small>
              </div>
            </div>

            <div className="stock-bar">
              <motion.div
                className="stock-bar-fill"
                initial={{ width: 0 }}
                whileInView={{ width: `${progress}%` }}
                viewport={{ once: true }}
                transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
              />
            </div>

            {content.exclusivityImage ? (
              <div className="exclusivity-art">
                <img
                  src={content.exclusivityImage}
                  alt="Coleção exclusiva Decoratie"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            ) : null}

            <div className="exclusivity-perks">
              {exclusivityPerks.map((perk) => (
                <div key={perk} className="perk">
                  <span className="perk-dot" />
                  {perk}
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
