export default function Footer({ settings }) {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <div className="footer-brand-name">
              Decora<span>tie</span>
            </div>
            <p className="footer-tag">{settings.brandTagline}</p>
          </div>

          <div className="footer-col">
            <h4>Navegação</h4>
            <ul>
              <li><a href="#colecao">Coleção</a></li>
              <li><a href="#historia">História</a></li>
              <li><a href="#exclusivo">Exclusividade</a></li>
              <li><a href="#depoimentos">Depoimentos</a></li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>Redes</h4>
            <ul>
              <li><a href={settings.instagramLink} target="_blank" rel="noreferrer">Instagram</a></li>
              <li><a href={settings.whatsappLink} target="_blank" rel="noreferrer">WhatsApp</a></li>
              <li><a href={settings.vipGroupLink} target="_blank" rel="noreferrer">Grupo VIP</a></li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>Atendimento</h4>
            <ul>
              <li><a href="#contato">Fale conosco</a></li>
              <li><a href="#contato">Curadoria</a></li>
              <li><a href="#contato">Trocas</a></li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Decoratie. Todos os direitos reservados.</span>
          <span>Feito com cuidado para mesas inesquecíveis.</span>
        </div>
      </div>
    </footer>
  )
}
