import { useDeferredValue, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../../lib/firebaseClient.js'
import { formatDateTime, getDateValue, getInitials } from '../../shared/formatters.js'
import ActionsDropdown from '../components/ActionsDropdown.jsx'
import {
  CheckIcon,
  DownloadIcon,
  SettingsIcon,
  TrashIcon,
} from '../components/AdminIcons.jsx'
import DataTable from '../components/DataTable.jsx'
import FilterButton from '../components/FilterButton.jsx'
import { useAdminUI } from '../components/AdminLayout.jsx'
import SearchInput from '../components/SearchInput.jsx'
import Toolbar from '../components/Toolbar.jsx'
import { useCollectionData } from '../hooks/useFirestoreData.js'
import { downloadCsv } from '../utils/exportCsv.js'

function sourceLabel(value) {
  const labels = {
    whatsapp: 'WhatsApp',
    formulario: 'Formulario',
    instagram: 'Instagram',
  }

  return labels[value] || value || 'Sem origem'
}

function LeadIdentityCell({ lead }) {
  return (
    <div className="admin-table-identity">
      <div className="admin-table-thumb admin-table-thumb-soft">
        <span>{getInitials(lead.nome || 'Lead')}</span>
      </div>

      <div className="admin-table-copy">
        <strong>{lead.nome || 'Sem nome'}</strong>
        <span className="admin-table-subtitle">
          {lead.contato || 'Contato nao informado.'}
        </span>
      </div>
    </div>
  )
}

function listSources(leads) {
  return [...new Set(leads.map((lead) => String(lead.origem || '').trim()).filter(Boolean))].sort((first, second) =>
    first.localeCompare(second, 'pt-BR')
  )
}

function buildFileStamp() {
  return new Date().toISOString().slice(0, 10)
}

export default function LeadsPage() {
  const navigate = useNavigate()
  const { data: leads, loading } = useCollectionData('leads')
  const { notify } = useAdminUI()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const deferredSearch = useDeferredValue(search)

  const originOptions = useMemo(() => listSources(leads), [leads])

  const filteredLeads = useMemo(() => {
    const normalizedSearch = deferredSearch.trim().toLowerCase()

    return [...leads]
      .sort((first, second) => {
        const secondDate = getDateValue(second.data)?.getTime() || 0
        const firstDate = getDateValue(first.data)?.getTime() || 0
        return secondDate - firstDate
      })
      .filter((lead) => {
        const origin = String(lead.origem || '').trim()

        if (normalizedSearch) {
          const haystack = `${lead.nome} ${lead.contato} ${origin}`.toLowerCase()

          if (!haystack.includes(normalizedSearch)) {
            return false
          }
        }

        if (statusFilter === 'pending' && lead.atendido) {
          return false
        }

        if (statusFilter === 'attended' && !lead.atendido) {
          return false
        }

        if (sourceFilter !== 'all' && origin !== sourceFilter) {
          return false
        }

        return true
      })
  }, [deferredSearch, leads, sourceFilter, statusFilter])

  const activeFilterCount = [
    statusFilter !== 'all',
    sourceFilter !== 'all',
  ].filter(Boolean).length

  const filterSections = useMemo(() => {
    const sections = [
      {
        id: 'status',
        title: 'Status',
        options: [
          {
            label: 'Todos',
            selected: statusFilter === 'all',
            onSelect: () => setStatusFilter('all'),
          },
          {
            label: 'Pendentes',
            selected: statusFilter === 'pending',
            onSelect: () => setStatusFilter('pending'),
          },
          {
            label: 'Atendidos',
            selected: statusFilter === 'attended',
            onSelect: () => setStatusFilter('attended'),
          },
        ],
      },
    ]

    if (originOptions.length) {
      sections.push({
        id: 'source',
        title: 'Origem',
        options: [
          {
            label: 'Todas',
            selected: sourceFilter === 'all',
            onSelect: () => setSourceFilter('all'),
          },
          ...originOptions.map((origin) => ({
            id: origin,
            label: sourceLabel(origin),
            selected: sourceFilter === origin,
            onSelect: () => setSourceFilter(origin),
          })),
        ],
      })
    }

    return sections
  }, [originOptions, sourceFilter, statusFilter])

  const columns = [
    {
      key: 'nome',
      header: 'Lead',
      mobileLabel: 'Lead',
      cell: (lead) => <LeadIdentityCell lead={lead} />,
    },
    {
      key: 'contato',
      header: 'Contato',
      cell: (lead) => (
        <div className="admin-table-stack">
          <strong>{lead.contato || '--'}</strong>
          <span>{lead.contato ? 'Canal principal' : 'Sem contato'}</span>
        </div>
      ),
    },
    {
      key: 'origem',
      header: 'Origem',
      cell: (lead) => (
        <div className="admin-table-stack">
          <strong>{sourceLabel(lead.origem)}</strong>
          <span>Entrada de captura</span>
        </div>
      ),
    },
    {
      key: 'data',
      header: 'Data',
      cell: (lead) => (
        <div className="admin-table-stack">
          <strong>{formatDateTime(lead.data)}</strong>
          <span>Recebido recentemente</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (lead) => (
        <span className={`admin-badge ${lead.atendido ? 'is-live' : 'is-muted'}`}>
          {lead.atendido ? 'Atendido' : 'Pendente'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Acoes',
      mobileLabel: 'Acoes',
      cellClassName: 'is-actions',
      cell: (lead) => (
        <div className="admin-table-actions">
          <button
            type="button"
            className="admin-icon-btn"
            onClick={() => toggleAttended(lead)}
            aria-label={lead.atendido ? `Reabrir lead ${lead.nome || ''}` : `Marcar lead ${lead.nome || ''} como atendido`}
          >
            <CheckIcon className="admin-inline-icon" />
          </button>
          <button
            type="button"
            className="admin-icon-btn is-danger"
            onClick={() => deleteLead(lead)}
            aria-label={`Excluir lead ${lead.nome || ''}`}
          >
            <TrashIcon className="admin-inline-icon" />
          </button>
        </div>
      ),
    },
  ]

  async function toggleAttended(lead) {
    try {
      await updateDoc(doc(db, 'leads', lead.id), {
        atendido: !lead.atendido,
        updatedAt: serverTimestamp(),
      })

      notify({
        type: 'success',
        title: lead.atendido ? 'Lead reaberto' : 'Lead marcado como atendido',
        description: lead.nome || 'Contato atualizado',
      })
    } catch (error) {
      notify({
        type: 'error',
        title: 'Nao foi possivel atualizar o lead',
        description: error.message || 'Tente novamente.',
      })
    }
  }

  async function deleteLead(lead) {
    const confirmed = window.confirm(`Excluir o lead "${lead.nome || 'sem nome'}"?`)

    if (!confirmed) {
      return
    }

    try {
      await deleteDoc(doc(db, 'leads', lead.id))

      notify({
        type: 'success',
        title: 'Lead excluido',
        description: lead.nome || 'Contato removido',
      })
    } catch (error) {
      notify({
        type: 'error',
        title: 'Nao foi possivel excluir o lead',
        description: error.message || 'Tente novamente.',
      })
    }
  }

  function clearFilters() {
    setStatusFilter('all')
    setSourceFilter('all')
  }

  function exportLeads() {
    downloadCsv({
      filename: `leads-${buildFileStamp()}.csv`,
      columns: [
        { label: 'Nome', value: (lead) => lead.nome || '' },
        { label: 'Contato', value: (lead) => lead.contato || '' },
        { label: 'Origem', value: (lead) => sourceLabel(lead.origem) },
        { label: 'Data', value: (lead) => formatDateTime(lead.data) },
        { label: 'Status', value: (lead) => (lead.atendido ? 'Atendido' : 'Pendente') },
      ],
      rows: filteredLeads,
    })

    notify({
      type: 'success',
      title: 'Exportacao concluida',
      description: `${filteredLeads.length} lead(s) foram preparados em CSV.`,
    })
  }

  const actionItems = [
    {
      id: 'export',
      label: 'Exportar',
      icon: DownloadIcon,
      onSelect: exportLeads,
    },
  ]

  return (
    <section className="admin-page-section admin-list-page">
      <div className="admin-page-header">
        <div>
          <span className="admin-kicker">Leads</span>
          <h1>Contato organizado para o time agir rapido.</h1>
          <p>As listagens do funil agora seguem a mesma base visual e operacional das demais telas.</p>
        </div>
      </div>

      <Toolbar
        search={(
          <SearchInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Procurar por nome, contato ou origem..."
            ariaLabel="Procurar leads"
          />
        )}
        filters={(
          <FilterButton
            activeCount={activeFilterCount}
            onClear={clearFilters}
            sections={filterSections}
          />
        )}
        actions={<ActionsDropdown items={actionItems} ariaLabel="Abrir acoes de leads" />}
      />

      <DataTable
        caption="Tabela de leads"
        columns={columns}
        rows={filteredLeads}
        loading={loading}
        loadingState="Carregando leads..."
        emptyState="Nenhum lead encontrado com o filtro atual."
      />
    </section>
  )
}
