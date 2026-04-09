import { useEffect, useRef, useState } from 'react'
import { formatUppercaseText, normalizeUppercaseText, roundCurrencyValue } from '../../shared/formatters.js'
import { calcularPrecoVenda } from '../services/custoService.js'
import {
  generateSuggestedProductDescription,
  resolveProductDescription,
} from '../services/productDescriptionService.js'
import {
  formatOrigemProdutoDetailed,
  getOrigemProdutoOption,
  isKnownOrigemProdutoValue,
  normalizeOrigemProdutoValue,
  ORIGEM_PRODUTO_OPTIONS,
} from '../services/origemProdutoOptions.js'
import ProductImageSearchModal from './ProductImageSearchModal.jsx'
import Modal from './Modal.jsx'
import { SearchIcon, UploadIcon } from './AdminIcons.jsx'

const emptyProduct = {
  nome: '',
  descricao: '',
  preco: '',
  precoVenda: '',
  categoria: '',
  setor: '',
  estoque: '',
  codigoProduto: '',
  ncm: '',
  cest: '',
  origemProduto: '',
  custoReal: '',
  margemPadrao: '',
  destaque: false,
  ativo: true,
  imagem: '',
  imagemPath: '',
}

const CREATE_NEW_OPTION = '__create-new__'
const UPPERCASE_FIELDS = new Set(['nome', 'descricao', 'categoria', 'setor', 'codigoProduto', 'ncm', 'cest'])

function hasOption(options, value) {
  const normalizedValue = String(value || '').trim()
  return Boolean(normalizedValue) && options.includes(normalizedValue)
}

export default function ProductModal({ categories = [], open, product, saving, sectors = [], onClose, onSave }) {
  const [form, setForm] = useState(emptyProduct)
  const [imageFile, setImageFile] = useState(null)
  const [preview, setPreview] = useState('')
  const [removeImage, setRemoveImage] = useState(false)
  const [searchModalOpen, setSearchModalOpen] = useState(false)
  const [selectedSearchImage, setSelectedSearchImage] = useState(null)
  const [categoryMode, setCategoryMode] = useState('select')
  const [sectorMode, setSectorMode] = useState('select')
  const categoriesRef = useRef(categories)
  const sectorsRef = useRef(sectors)

  useEffect(() => {
    categoriesRef.current = categories
  }, [categories])

  useEffect(() => {
    sectorsRef.current = sectors
  }, [sectors])

  useEffect(() => {
    if (!open) {
      return
    }

    const nextForm = product
      ? {
          ...emptyProduct,
          ...product,
          nome: normalizeUppercaseText(product.nome),
          preco: product.precoVenda ?? product.preco ?? '',
          precoVenda: product.precoVenda ?? product.preco ?? '',
          estoque: product.estoque ?? '',
          custoReal: product.custoReal ?? '',
          margemPadrao: product.margemPadrao ?? '',
          descricao: normalizeUppercaseText(resolveProductDescription(product)),
          categoria: normalizeUppercaseText(product.categoria),
          setor: normalizeUppercaseText(product.setor),
          codigoProduto: normalizeUppercaseText(product.codigoProduto),
          ncm: normalizeUppercaseText(product.ncm),
          cest: normalizeUppercaseText(product.cest),
          origemProduto: normalizeOrigemProdutoValue(product.origemProduto) || product.origemProduto || '',
        }
      : emptyProduct

    setForm(nextForm)
    setImageFile(null)
    setPreview(nextForm.imagem || '')
    setRemoveImage(false)
    setSearchModalOpen(false)
    setSelectedSearchImage(null)
    setCategoryMode(hasOption(categoriesRef.current, nextForm.categoria) || !nextForm.categoria ? 'select' : 'custom')
    setSectorMode(hasOption(sectorsRef.current, nextForm.setor) || !nextForm.setor ? 'select' : 'custom')
  }, [open, product])

  useEffect(() => {
    if (imageFile) {
      const objectUrl = URL.createObjectURL(imageFile)
      setPreview(objectUrl)

      return () => {
        URL.revokeObjectURL(objectUrl)
      }
    }

    if (selectedSearchImage?.thumbnailUrl || selectedSearchImage?.imageUrl) {
      setPreview(selectedSearchImage.thumbnailUrl || selectedSearchImage.imageUrl)
      return undefined
    }

    if (!imageFile) {
      setPreview(removeImage ? '' : form.imagem || '')
      return undefined
    }
  }, [form.imagem, imageFile, removeImage, selectedSearchImage])

  useEffect(() => {
    const custoReal = Number(form.custoReal)
    const margemPadrao = Number(form.margemPadrao)

    if (!Number.isFinite(custoReal) || custoReal < 0) {
      return
    }

    const precoVenda = calcularPrecoVenda(custoReal, margemPadrao)

    setForm((current) => {
      const nextValue = String(precoVenda)
      if (String(current.precoVenda) === nextValue && String(current.preco) === nextValue) {
        return current
      }

      return {
        ...current,
        precoVenda: nextValue,
        preco: nextValue,
      }
    })
  }, [form.custoReal, form.margemPadrao])

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: typeof value === 'string' && UPPERCASE_FIELDS.has(field) ? value.toLocaleUpperCase('pt-BR') : value,
    }))
  }

  function handleSelectFieldChange(field, value) {
    const isCategoryField = field === 'categoria'

    if (value === CREATE_NEW_OPTION) {
      if (isCategoryField) {
        setCategoryMode('custom')
      } else {
        setSectorMode('custom')
      }

      updateField(field, '')
      return
    }

    if (isCategoryField) {
      setCategoryMode('select')
    } else {
      setSectorMode('select')
    }

    updateField(field, value)
  }

  async function handleSubmit(event) {
    event.preventDefault()

    await onSave({
      ...form,
      nome: normalizeUppercaseText(form.nome),
      descricao: normalizeUppercaseText(resolveProductDescription(form)),
      categoria: normalizeUppercaseText(form.categoria),
      setor: normalizeUppercaseText(form.setor),
      codigoProduto: normalizeUppercaseText(form.codigoProduto),
      ncm: normalizeUppercaseText(form.ncm),
      cest: normalizeUppercaseText(form.cest),
      preco: roundCurrencyValue(form.precoVenda || form.preco),
      precoVenda: roundCurrencyValue(form.precoVenda || form.preco),
      origemProduto: normalizeOrigemProdutoValue(form.origemProduto) || form.origemProduto?.trim() || '',
      custoReal: form.custoReal === '' ? null : Number(form.custoReal),
      margemPadrao: form.margemPadrao === '' ? null : Number(form.margemPadrao),
      estoque: form.estoque === '' ? null : Number(form.estoque),
      imageFile,
      selectedSearchImage,
      removeImage,
    })
  }

  const selectedOrigemOption = getOrigemProdutoOption(form.origemProduto)
  const hasCustomOrigemValue = form.origemProduto && !isKnownOrigemProdutoValue(form.origemProduto)
  const categorySelectValue = categoryMode === 'custom' ? CREATE_NEW_OPTION : form.categoria || ''
  const sectorSelectValue = sectorMode === 'custom' ? CREATE_NEW_OPTION : form.setor || ''
  const suggestedDescription = normalizeUppercaseText(generateSuggestedProductDescription(form))

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      title={product ? 'Editar produto' : 'Novo produto'}
      width="large"
    >
      <form className="admin-form admin-modal-body" onSubmit={handleSubmit}>
        <div className="admin-form-grid">
          <label className="admin-field">
            <span>Nome</span>
            <input
              className="admin-input"
              value={form.nome}
              onChange={(event) => updateField('nome', event.target.value)}
              placeholder="Ex.: Jogo Toscana"
              required
            />
            <div className="admin-field-inline-actions">
              <button
                type="button"
                className="admin-field-link"
                onClick={() => updateField('descricao', suggestedDescription)}
                disabled={!suggestedDescription}
              >
                Sugerir descricao pelo nome do produto
              </button>
              <small className="admin-field-hint">
                Preenche a descricao com uma sugestao contextual baseada no nome, categoria e setor.
              </small>
            </div>
          </label>

          <label className="admin-field">
            <span>Categoria</span>
            <select
              className="admin-select"
              value={categorySelectValue}
              onChange={(event) => handleSelectFieldChange('categoria', event.target.value)}
              required
            >
              <option value="">Selecione uma categoria</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {formatUppercaseText(category)}
                </option>
              ))}
              <option value={CREATE_NEW_OPTION}>Cadastrar nova categoria</option>
            </select>
            {categoryMode === 'custom' ? (
              <input
                className="admin-input"
                value={form.categoria}
                onChange={(event) => updateField('categoria', event.target.value)}
                placeholder="Digite a nova categoria"
                required
              />
            ) : (
              <small className="admin-field-hint">Escolha uma categoria existente ou cadastre uma nova.</small>
            )}
          </label>

          <label className="admin-field">
            <span>Setor</span>
            <select
              className="admin-select"
              value={sectorSelectValue}
              onChange={(event) => handleSelectFieldChange('setor', event.target.value)}
            >
              <option value="">Selecione um setor</option>
              {sectors.map((sector) => (
                <option key={sector} value={sector}>
                  {formatUppercaseText(sector)}
                </option>
              ))}
              <option value={CREATE_NEW_OPTION}>Cadastrar novo setor</option>
            </select>
            {sectorMode === 'custom' ? (
              <input
                className="admin-input"
                value={form.setor}
                onChange={(event) => updateField('setor', event.target.value)}
                placeholder="Digite o novo setor"
              />
            ) : (
              <small className="admin-field-hint">Use um setor ja existente ou crie um novo se precisar.</small>
            )}
          </label>

          <label className="admin-field">
            <span>Estoque</span>
            <input
              className="admin-input"
              type="number"
              min="0"
              step="1"
              value={form.estoque}
              onChange={(event) => updateField('estoque', event.target.value)}
              placeholder="Ex.: 12"
            />
          </label>

          <label className="admin-field">
            <span>Codigo do produto</span>
            <input
              className="admin-input"
              value={form.codigoProduto}
              onChange={(event) => updateField('codigoProduto', event.target.value)}
              placeholder="Ex.: 001245"
            />
          </label>

          <label className="admin-field">
            <span>NCM</span>
            <input
              className="admin-input"
              value={form.ncm}
              onChange={(event) => updateField('ncm', event.target.value)}
              placeholder="Ex.: 69120000"
            />
          </label>

          <label className="admin-field">
            <span>CEST</span>
            <input
              className="admin-input"
              value={form.cest}
              onChange={(event) => updateField('cest', event.target.value)}
              placeholder="Ex.: 12.345.67"
            />
          </label>

          <label className="admin-field admin-field-full">
            <span>Origem do produto</span>
            <select
              className="admin-select"
              value={form.origemProduto}
              onChange={(event) => updateField('origemProduto', event.target.value)}
            >
              <option value="">Selecione o codigo de origem da NF-e</option>
              {hasCustomOrigemValue ? (
                <option value={form.origemProduto}>{`Valor atual nao padronizado: ${form.origemProduto}`}</option>
              ) : null}
              {ORIGEM_PRODUTO_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {formatUppercaseText(formatOrigemProdutoDetailed(option.value))}
                </option>
              ))}
            </select>
            <small className="admin-field-hint">
              {selectedOrigemOption
                ? selectedOrigemOption.description
                : 'Use a Tabela A da NF-e para classificar a origem fiscal da mercadoria.'}
            </small>
          </label>

          <div className="admin-product-pricing-grid admin-field-full">
            <label className="admin-field">
              <span>Custo real</span>
              <input
                className="admin-input"
                type="number"
                min="0"
                step="0.01"
                value={form.custoReal}
                onChange={(event) => updateField('custoReal', event.target.value)}
                placeholder="0,00"
              />
            </label>

            <label className="admin-field">
              <span>Margem padrao (%)</span>
              <input
                className="admin-input"
                type="number"
                min="0"
                step="0.01"
                value={form.margemPadrao}
                onChange={(event) => updateField('margemPadrao', event.target.value)}
                placeholder="0,00"
              />
            </label>

            <label className="admin-field">
              <span>Preco de venda</span>
              <input
                className="admin-input"
                type="number"
                min="0"
                step="0.01"
                value={form.precoVenda}
                onChange={(event) => updateField('precoVenda', event.target.value)}
                placeholder="0,00"
                required
              />
            </label>
          </div>

          <div className="admin-field admin-field-toggles">
            <span>Status</span>
            <label className="admin-toggle">
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={(event) => updateField('ativo', event.target.checked)}
              />
              <span>Produto ativo</span>
            </label>
            <label className="admin-toggle">
              <input
                type="checkbox"
                checked={form.destaque}
                onChange={(event) => updateField('destaque', event.target.checked)}
              />
              <span>Mostrar como destaque</span>
            </label>
          </div>

          <label className="admin-field admin-field-full">
            <span>Descricao</span>
            <textarea
              className="admin-textarea"
              value={form.descricao}
              onChange={(event) => updateField('descricao', event.target.value)}
              placeholder="Descreva o produto com linguagem premium e objetiva."
              rows="5"
              required
            />
          </label>
        </div>

        <div className="admin-upload-row">
          <div className="admin-upload-preview">
            {preview ? <img src={preview} alt={form.nome || 'Preview do produto'} /> : <span>Preview da imagem</span>}
          </div>

          <div className="admin-upload-actions">
            <label className="admin-upload-dropzone">
              <input
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const nextFile = event.target.files?.[0] || null
                  setImageFile(nextFile)
                  setSelectedSearchImage(null)
                  setRemoveImage(false)
                }}
              />
              <UploadIcon className="admin-inline-icon" />
              <div>
                <strong>Enviar imagem</strong>
                <p>PNG, JPG ou WEBP para a linha do produto.</p>
              </div>
            </label>

            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              onClick={() => setSearchModalOpen(true)}
            >
              <SearchIcon className="admin-inline-icon" />
              <span>Google Imagens</span>
            </button>

            {selectedSearchImage ? (
              <div className="admin-inline-notice">
                A imagem escolhida no Google sera importada para o cadastro quando voce salvar este produto.
              </div>
            ) : null}

            {(form.imagem || imageFile || selectedSearchImage) && (
              <button
                type="button"
                className="admin-btn admin-btn-ghost"
                onClick={() => {
                  setImageFile(null)
                  setPreview('')
                  setSelectedSearchImage(null)
                  setRemoveImage(true)
                }}
              >
                Remover imagem atual
              </button>
            )}
          </div>
        </div>

        <div className="admin-modal-actions">
          <button type="button" className="admin-btn admin-btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="admin-btn" disabled={saving}>
            {saving ? 'Salvando...' : product ? 'Salvar alteracoes' : 'Criar produto'}
          </button>
        </div>
      </form>

      <ProductImageSearchModal
        initialQuery={form.nome}
        onClose={() => setSearchModalOpen(false)}
        onSelectImage={(image) => {
          setSelectedSearchImage(image)
          setImageFile(null)
          setRemoveImage(false)
        }}
        open={searchModalOpen}
      />
    </Modal>
  )
}
