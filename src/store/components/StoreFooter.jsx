export default function StoreFooter() {
  return (
    <footer className="store-footer">
      <div className="container store-footer-inner">
        <span className="store-footer-brand">Decoratie</span>
        <p className="store-footer-copy">
          Curadoria para mesas autorais com compra simples, rapida e pensada para o celular.
        </p>
        <p className="store-footer-copy store-footer-copy-muted">
          CNPJ: 48.459.163/0001-63
        </p>
        <p className="store-footer-copy store-footer-copy-muted">
          &copy; {new Date().getFullYear()} Decoratie. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  )
}
