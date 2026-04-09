import { defaultLandingContent, defaultSettings } from '../../data/siteDefaults.js'
import { formatDateTime, getDateValue } from '../../shared/formatters.js'
import { useCollectionData, useDocumentData } from '../hooks/useFirestoreData.js'
import {
  ContentIcon,
  DashboardIcon,
  LeadsIcon,
  ProductsIcon,
  SettingsIcon,
} from '../components/AdminIcons.jsx'

function StatCard({ icon: Icon, label, value, detail }) {
  return (
    <article className="admin-stat-card">
      <div className="admin-stat-icon">
        <Icon className="admin-inline-icon" />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  )
}

export default function DashboardPage() {
  const { data: products, loading: loadingProducts } = useCollectionData('produtos')
  const { data: leads, loading: loadingLeads } = useCollectionData('leads')
  const { data: content } = useDocumentData('conteudo', 'landing', defaultLandingContent)
  const { data: settings } = useDocumentData('configuracoes', 'geral', defaultSettings)

  const activeProducts = products.filter((product) => product.ativo !== false)
  const featuredProducts = products.filter((product) => product.destaque)

  const allDates = [
    ...products.map((product) => product.updatedAt || product.createdAt),
    ...leads.map((lead) => lead.updatedAt || lead.data),
    content.updatedAt,
    settings.updatedAt,
  ]
    .map(getDateValue)
    .filter(Boolean)
    .sort((first, second) => second.getTime() - first.getTime())

  const latestLeads = [...leads]
    .sort((first, second) => {
      const secondDate = getDateValue(second.data)?.getTime() || 0
      const firstDate = getDateValue(first.data)?.getTime() || 0
      return secondDate - firstDate
    })
    .slice(0, 4)

  const latestProducts = [...products]
    .sort((first, second) => {
      const secondDate = getDateValue(second.updatedAt || second.createdAt)?.getTime() || 0
      const firstDate = getDateValue(first.updatedAt || first.createdAt)?.getTime() || 0
      return secondDate - firstDate
    })
    .slice(0, 4)

  return (
    <section className="admin-page-section">
      <div className="admin-page-header">
        <div>
          <span className="admin-kicker">Dashboard</span>
          <h1>Visão rápida do que mais importa.</h1>
          <p>Resumo operacional do catálogo, conteúdo e leads em uma única tela.</p>
        </div>
      </div>

      <div className="admin-stats-grid">
        <StatCard
          icon={ProductsIcon}
          label="Total de produtos"
          value={loadingProducts ? '...' : products.length}
          detail="Catálogo completo no Firestore"
        />
        <StatCard
          icon={LeadsIcon}
          label="Leads recebidos"
          value={loadingLeads ? '...' : leads.length}
          detail="Entradas acompanhadas pela equipe"
        />
        <StatCard
          icon={DashboardIcon}
          label="Produtos ativos"
          value={loadingProducts ? '...' : activeProducts.length}
          detail="Itens visíveis na landing"
        />
        <StatCard
          icon={SettingsIcon}
          label="Última atualização"
          value={allDates[0] ? formatDateTime(allDates[0]) : '--'}
          detail={`Status do sistema: ${settings.systemStatus || 'online'}`}
        />
      </div>

      <div className="admin-duo-grid">
        <article className="admin-surface">
          <div className="admin-surface-head">
            <div>
              <span className="admin-kicker">Destaques</span>
              <h2>Resumo editorial</h2>
            </div>
            <ContentIcon className="admin-inline-icon" />
          </div>

          <div className="admin-summary-list">
            <div>
              <strong>{featuredProducts.length}</strong>
              <span>Produtos em destaque</span>
            </div>
            <div>
              <strong>{content.ctaText || settings.ctaDefaultText}</strong>
              <span>CTA principal em uso</span>
            </div>
            <div>
              <strong>{settings.systemStatus || 'online'}</strong>
              <span>Status operacional</span>
            </div>
          </div>
        </article>

        <article className="admin-surface">
          <div className="admin-surface-head">
            <div>
              <span className="admin-kicker">Landing</span>
              <h2>Conteúdo publicado</h2>
            </div>
            <SettingsIcon className="admin-inline-icon" />
          </div>

          <div className="admin-mini-stack">
            <div>
              <strong>Hero</strong>
              <p>{content.heroTitle}</p>
            </div>
            <div>
              <strong>CTA</strong>
              <p>{content.ctaSubtitle}</p>
            </div>
          </div>
        </article>
      </div>

      <div className="admin-duo-grid">
        <article className="admin-surface">
          <div className="admin-surface-head">
            <div>
              <span className="admin-kicker">Leads recentes</span>
              <h2>Últimos contatos</h2>
            </div>
            <LeadsIcon className="admin-inline-icon" />
          </div>

          {latestLeads.length ? (
            <div className="admin-list-cards">
              {latestLeads.map((lead) => (
                <div key={lead.id} className="admin-list-card">
                  <div>
                    <strong>{lead.nome || 'Lead sem nome'}</strong>
                    <span>{lead.contato || 'Sem contato informado'}</span>
                  </div>
                  <small>{formatDateTime(lead.data)}</small>
                </div>
              ))}
            </div>
          ) : (
            <div className="admin-empty-state">
              <p>Nenhum lead cadastrado até agora.</p>
            </div>
          )}
        </article>

        <article className="admin-surface">
          <div className="admin-surface-head">
            <div>
              <span className="admin-kicker">Produtos recentes</span>
              <h2>Catálogo em movimento</h2>
            </div>
            <ProductsIcon className="admin-inline-icon" />
          </div>

          {latestProducts.length ? (
            <div className="admin-list-cards">
              {latestProducts.map((product) => (
                <div key={product.id} className="admin-list-card">
                  <div>
                    <strong>{product.nome}</strong>
                    <span>{product.categoria || 'Sem categoria'}</span>
                  </div>
                  <small>{product.ativo !== false ? 'Ativo' : 'Inativo'}</small>
                </div>
              ))}
            </div>
          ) : (
            <div className="admin-empty-state">
              <p>Seu catálogo ainda está vazio.</p>
            </div>
          )}
        </article>
      </div>
    </section>
  )
}
