import Reveal from '../components/Reveal.jsx'

const TESTIMONIALS = [
  {
    text: 'Cada peça é uma obra. Nossos jantares mudaram completamente — ninguém quer mais ir embora.',
    name: 'Marina Castro',
    loc: 'São Paulo · SP',
    initial: 'M',
  },
  {
    text: 'Achei que era só decoração. Era ritual. A Decoratie entendeu uma coisa que eu nem sabia explicar.',
    name: 'Beatriz Lemos',
    loc: 'Curitiba · PR',
    initial: 'B',
  },
  {
    text: 'Atendimento impecável. Recebi a curadoria pelo WhatsApp e tudo combinou perfeitamente com a minha mesa.',
    name: 'Ana Vasconcelos',
    loc: 'Belo Horizonte · MG',
    initial: 'A',
  },
]

export default function SocialProof() {
  return (
    <section id="depoimentos" className="social-proof">
      <div className="container">
        <Reveal as="div" className="social-head">
          <span className="eyebrow">Quem já vive a experiência</span>
          <h2 className="h-section">A mesa que conquista — em palavras de quem já sentou nela.</h2>
        </Reveal>

        <Reveal stagger className="testimonials">
          {TESTIMONIALS.map((t) => (
            <div key={t.name} className="testimonial">
              <span className="stars">★★★★★</span>
              <p className="testimonial-text">"{t.text}"</p>
              <div className="testimonial-author">
                <div className="author-avatar">{t.initial}</div>
                <div className="author-meta">
                  <span className="author-name">{t.name}</span>
                  <span className="author-loc">{t.loc}</span>
                </div>
              </div>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  )
}
