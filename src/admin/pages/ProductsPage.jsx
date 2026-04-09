import { useDeferredValue, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { db } from '../../lib/firebaseClient.js'
import { removeStoredFile, uploadImage } from '../../lib/storageUploads.js'
import { formatCurrency, getDateValue, getInitials } from '../../shared/formatters.js'
import ActionsDropdown from '../components/ActionsDropdown.jsx'
import {
  CheckIcon,
  DownloadIcon,
  EditIcon,
  PlusIcon,
  SettingsIcon,
  TrashIcon,
} from '../components/AdminIcons.jsx'
import DataTable from '../components/DataTable.jsx'
import FilterButton from '../components/FilterButton.jsx'
import { useAdminUI } from '../components/AdminLayout.jsx'
import ProductModal from '../components/ProductModal.jsx'
import SearchInput from '../components/SearchInput.jsx'
import Toolbar from '../components/Toolbar.jsx'
import { useCollectionData } from '../hooks/useFirestoreData.js'
import { downloadCsv } from '../utils/exportCsv.js'

function ProductIdentityCell({ product }) {
  return (
    <div className="admin-table-identity">
      <div className="admin-table-thumb">
        {product.imagem ? (
          <img
            src={product.imagem}
            alt={product.nome}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span>{getInitials(product.nome)}</span>
        )}
      </div>

      <div className="admin-table-copy">
        <strong>{product.nome}</strong>
        <span className="admin-table-subtitle">
          {product.descricao || 'Descricao nao informada.'}
        </span>

        <div className="admin-table-badges">
          <span className={`admin-badge ${product.ativo !== false ? 'is-live' : 'is-muted'}`}>
            {product.ativo !== false ? 'Ativo' : 'Inativo'}
          </span>
          {product.destaque ? <span className="admin-badge is-accent">Destaque</span> : null}
        </div>
      </div>
    </div>
  )
}

function ProductStockCell({ product }) {
  const hasStoredValue = product.estoque !== '' && product.estoque !== null && product.estoque !== undefined
  const stockValue = hasStoredValue ? Number(product.estoque) : Number.NaN
  const hasInventoryControl = Number.isFinite(stockValue)

  return (
    <div className="admin-table-stack">
      <strong>{hasInventoryControl ? stockValue : '--'}</strong>
      <span>{hasInventoryControl ? 'unidades' : 'Sem controle'}</span>
    </div>
  )
}

function listOptions(values) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))].sort((first, second) =>
    first.localeCompare(second, 'pt-BR')
  )
}

function buildFileStamp() {
  return new Date().toISOString().slice(0, 10)
}

export default function ProductsPage() {
  const navigate = useNavigate()
  const { data: products, loading } = useCollectionData('produtos')
  const { notify } = useAdminUI()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [featuredFilter, setFeaturedFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [sectorFilter, setSectorFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [saving, setSaving] = useState(false)
  const deferredSearch = useDeferredValue(search)

  const categories = useMemo(() => listOptions(products.map((product) => product.categoria)), [products])
  const sectors = useMemo(() => listOptions(products.map((product) => product.setor)), [products])

  const filteredProducts = useMemo(() => {
    const normalizedSearch = deferredSearch.trim().toLowerCase()

    return [...products]
      .sort((first, second) => {
        if (first.destaque !== second.destaque) {
          return Number(second.destaque) - Number(first.destaque)
        }

        const secondDate = getDateValue(second.updatedAt || second.createdAt)?.getTime() || 0
        const firstDate = getDateValue(first.updatedAt || first.createdAt)?.getTime() || 0
        return secondDate - firstDate
      })
      .filter((product) => {
        const category = String(product.categoria || '').trim()
        const sector = String(product.setor || '').trim()
        const isActive = product.ativo !== false

        if (normalizedSearch) {
          const haystack = `${product.nome} ${category} ${sector} ${product.descricao}`.toLowerCase()

          if (!haystack.includes(normalizedSearch)) {
            return false
          }
        }

        if (statusFilter === 'active' && !isActive) {
          return false
        }

        if (statusFilter === 'inactive' && isActive) {
          return false
        }

        if (featuredFilter === 'featured' && !product.destaque) {
          return false
        }

        if (featuredFilter === 'regular' && product.destaque) {
          return false
        }

        if (categoryFilter !== 'all' && category !== categoryFilter) {
          return false
        }

        if (sectorFilter !== 'all' && sector !== sectorFilter) {
          return false
        }

        return true
      })
  }, [categoryFilter, deferredSearch, featuredFilter, products, sectorFilter, statusFilter])

  const activeFilterCount = [
    statusFilter !== 'all',
    featuredFilter !== 'all',
    categoryFilter !== 'all',
    sectorFilter !== 'all',
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
            label: 'Ativos',
            selected: statusFilter === 'active',
            onSelect: () => setStatusFilter('active'),
          },
          {
            label: 'Inativos',
            selected: statusFilter === 'inactive',
            onSelect: () => setStatusFilter('inactive'),
          },
        ],
      },
      {
        id: 'featured',
        title: 'Destaque',
        options: [
          {
            label: 'Todos',
            selected: featuredFilter === 'all',
            onSelect: () => setFeaturedFilter('all'),
          },
          {
            label: 'Em destaque',
            selected: featuredFilter === 'featured',
            onSelect: () => setFeaturedFilter('featured'),
          },
          {
            label: 'Regulares',
            selected: featuredFilter === 'regular',
            onSelect: () => setFeaturedFilter('regular'),
          },
        ],
      },
    ]

    if (categories.length) {
      sections.push({
        id: 'category',
        title: 'Categoria',
        options: [
          {
            label: 'Todas',
            selected: categoryFilter === 'all',
            onSelect: () => setCategoryFilter('all'),
          },
          ...categories.map((category) => ({
            id: category,
            label: category,
            selected: categoryFilter === category,
            onSelect: () => setCategoryFilter(category),
          })),
        ],
      })
    }

    if (sectors.length) {
      sections.push({
        id: 'sector',
        title: 'Setor',
        options: [
          {
            label: 'Todos',
            selected: sectorFilter === 'all',
            onSelect: () => setSectorFilter('all'),
          },
          ...sectors.map((sector) => ({
            id: sector,
            label: sector,
            selected: sectorFilter === sector,
            onSelect: () => setSectorFilter(sector),
          })),
        ],
      })
    }

    return sections
  }, [categories, categoryFilter, featuredFilter, sectorFilter, sectors, statusFilter])

  const columns = [
    {
      key: 'nome',
      header: 'Nome + imagem',
      mobileLabel: 'Produto',
      cell: (product) => <ProductIdentityCell product={product} />,
    },
    {
      key: 'categoria',
      header: 'Categoria',
      cell: (product) => (
        <div className="admin-table-stack">
          <strong>{product.categoria || 'Sem categoria'}</strong>
          <span>Classificacao principal</span>
        </div>
      ),
    },
    {
      key: 'setor',
      header: 'Setor',
      cell: (product) => (
        <div className="admin-table-stack">
          <strong>{product.setor || 'Sem setor'}</strong>
          <span>Segmento interno</span>
        </div>
      ),
    },
    {
      key: 'preco',
      header: 'Preco',
      cell: (product) => <strong className="admin-table-price">{formatCurrency(product.preco)}</strong>,
    },
    {
      key: 'estoque',
      header: 'Estoque',
      cell: (product) => <ProductStockCell product={product} />,
    },
    {
      key: 'actions',
      header: 'Acoes',
      mobileLabel: 'Acoes',
      cellClassName: 'is-actions',
      cell: (product) => (
        <div className="admin-table-actions">
          <button
            type="button"
            className="admin-icon-btn"
            onClick={() => openEditProduct(product)}
            aria-label={`Editar ${product.nome}`}
          >
            <EditIcon className="admin-inline-icon" />
          </button>
          <button
            type="button"
            className="admin-icon-btn"
            onClick={() => toggleProductStatus(product)}
            aria-label={product.ativo !== false ? `Desativar ${product.nome}` : `Ativar ${product.nome}`}
          >
            <CheckIcon className="admin-inline-icon" />
          </button>
          <button
            type="button"
            className="admin-icon-btn is-danger"
            onClick={() => deleteProduct(product)}
            aria-label={`Excluir ${product.nome}`}
          >
            <TrashIcon className="admin-inline-icon" />
          </button>
        </div>
      ),
    },
  ]

  function openNewProduct() {
    setEditingProduct(null)
    setModalOpen(true)
  }

  function openEditProduct(product) {
    setEditingProduct(product)
    setModalOpen(true)
  }

  async function handleSaveProduct(draft) {
    setSaving(true)

    try {
      const hasExistingProduct = Boolean(editingProduct?.id)
      const productRef = hasExistingProduct ? doc(db, 'produtos', editingProduct.id) : doc(collection(db, 'produtos'))
      let imageUrl = editingProduct?.imagem || ''
      let imagePath = editingProduct?.imagemPath || ''

      if (draft.removeImage && imagePath) {
        await removeStoredFile(imagePath)
        imageUrl = ''
        imagePath = ''
      }

      if (draft.imageFile) {
        const uploaded = await uploadImage(draft.imageFile, `products/${productRef.id}`)

        if (imagePath && imagePath !== uploaded.path) {
          await removeStoredFile(imagePath)
        }

        imageUrl = uploaded.url
        imagePath = uploaded.path
      }

      const payload = {
        nome: draft.nome.trim(),
        descricao: draft.descricao.trim(),
        preco: Number.isFinite(draft.preco) ? draft.preco : 0,
        categoria: draft.categoria.trim(),
        setor: draft.setor?.trim() || '',
        estoque: Number.isFinite(draft.estoque) ? draft.estoque : null,
        destaque: Boolean(draft.destaque),
        ativo: Boolean(draft.ativo),
        imagem: imageUrl,
        imagemPath: imagePath,
        updatedAt: serverTimestamp(),
      }

      if (hasExistingProduct) {
        await updateDoc(productRef, payload)
      } else {
        await setDoc(productRef, {
          ...payload,
          createdAt: serverTimestamp(),
        })
      }

      notify({
        type: 'success',
        title: hasExistingProduct ? 'Produto atualizado' : 'Produto criado',
        description: `${draft.nome} esta pronto para uso no catalogo.`,
      })

      setModalOpen(false)
      setEditingProduct(null)
    } catch (error) {
      notify({
        type: 'error',
        title: 'Nao foi possivel salvar o produto',
        description: error.message || 'Revise os dados e tente novamente.',
      })
    } finally {
      setSaving(false)
    }
  }

  async function toggleProductStatus(product) {
    try {
      await updateDoc(doc(db, 'produtos', product.id), {
        ativo: !(product.ativo !== false),
        updatedAt: serverTimestamp(),
      })

      notify({
        type: 'success',
        title: product.ativo !== false ? 'Produto desativado' : 'Produto ativado',
        description: product.nome,
      })
    } catch (error) {
      notify({
        type: 'error',
        title: 'Nao foi possivel atualizar o status',
        description: error.message || 'Tente novamente.',
      })
    }
  }

  async function deleteProduct(product) {
    const confirmed = window.confirm(`Excluir "${product.nome}" do catalogo?`)

    if (!confirmed) {
      return
    }

    try {
      if (product.imagemPath) {
        await removeStoredFile(product.imagemPath)
      }

      await deleteDoc(doc(db, 'produtos', product.id))

      notify({
        type: 'success',
        title: 'Produto excluido',
        description: `${product.nome} foi removido do catalogo.`,
      })
    } catch (error) {
      notify({
        type: 'error',
        title: 'Nao foi possivel excluir o produto',
        description: error.message || 'Tente novamente.',
      })
    }
  }

  function clearFilters() {
    setStatusFilter('all')
    setFeaturedFilter('all')
    setCategoryFilter('all')
    setSectorFilter('all')
  }

  function exportProducts() {
    downloadCsv({
      filename: `produtos-${buildFileStamp()}.csv`,
      columns: [
        { label: 'Nome', value: (product) => product.nome },
        { label: 'Categoria', value: (product) => product.categoria || '' },
        { label: 'Setor', value: (product) => product.setor || '' },
        { label: 'Preco', value: (product) => formatCurrency(product.preco) },
        { label: 'Estoque', value: (product) => product.estoque ?? '' },
        { label: 'Status', value: (product) => (product.ativo !== false ? 'Ativo' : 'Inativo') },
        { label: 'Destaque', value: (product) => (product.destaque ? 'Sim' : 'Nao') },
      ],
      rows: filteredProducts,
    })

    notify({
      type: 'success',
      title: 'Exportacao concluida',
      description: `${filteredProducts.length} produto(s) foram preparados em CSV.`,
    })
  }

  const actionItems = [
    {
      id: 'new',
      label: 'Novo produto',
      icon: PlusIcon,
      onSelect: openNewProduct,
    },
    {
      id: 'export',
      label: 'Exportar',
      icon: DownloadIcon,
      onSelect: exportProducts,
    },
  ]

  return (
    <section className="admin-page-section admin-list-page">
      <div className="admin-page-header">
        <div>
          <span className="admin-kicker">Produtos</span>
          <h1>Catalogo com controle total.</h1>
          <p>Busca, filtros e acoes agora seguem o mesmo padrao elegante das demais listagens.</p>
        </div>
      </div>

      <Toolbar
        search={(
          <SearchInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Procurar por produto, categoria ou setor..."
            ariaLabel="Procurar produtos"
          />
        )}
        filters={(
          <FilterButton
            activeCount={activeFilterCount}
            onClear={clearFilters}
            sections={filterSections}
          />
        )}
        actions={<ActionsDropdown items={actionItems} ariaLabel="Abrir acoes de produtos" />}
      />

      <DataTable
        caption="Tabela de produtos"
        columns={columns}
        rows={filteredProducts}
        loading={loading}
        loadingState="Carregando catalogo..."
        emptyState="Nenhum produto encontrado com esse filtro."
      />

      <ProductModal
        open={modalOpen}
        product={editingProduct}
        saving={saving}
        onClose={() => {
          if (!saving) {
            setModalOpen(false)
            setEditingProduct(null)
          }
        }}
        onSave={handleSaveProduct}
      />
    </section>
  )
}
