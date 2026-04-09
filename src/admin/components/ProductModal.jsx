import { useEffect, useState } from 'react'
import Modal from './Modal.jsx'
import { UploadIcon } from './AdminIcons.jsx'

const emptyProduct = {
  nome: '',
  descricao: '',
  preco: '',
  categoria: '',
  setor: '',
  estoque: '',
  destaque: false,
  ativo: true,
  imagem: '',
  imagemPath: '',
}

export default function ProductModal({ open, product, saving, onClose, onSave }) {
  const [form, setForm] = useState(emptyProduct)
  const [imageFile, setImageFile] = useState(null)
  const [preview, setPreview] = useState('')
  const [removeImage, setRemoveImage] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }

    const nextForm = product
      ? {
          ...emptyProduct,
          ...product,
          preco: product.preco ?? '',
          estoque: product.estoque ?? '',
        }
      : emptyProduct

    setForm(nextForm)
    setImageFile(null)
    setPreview(nextForm.imagem || '')
    setRemoveImage(false)
  }, [open, product])

  useEffect(() => {
    if (!imageFile) {
      setPreview(removeImage ? '' : form.imagem || '')
      return undefined
    }

    const objectUrl = URL.createObjectURL(imageFile)
    setPreview(objectUrl)

    return () => {
      URL.revokeObjectURL(objectUrl)
    }
  }, [form.imagem, imageFile, removeImage])

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()

    await onSave({
      ...form,
      preco: Number(form.preco),
      estoque: form.estoque === '' ? null : Number(form.estoque),
      imageFile,
      removeImage,
    })
  }

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
          </label>

          <label className="admin-field">
            <span>Categoria</span>
            <input
              className="admin-input"
              value={form.categoria}
              onChange={(event) => updateField('categoria', event.target.value)}
              placeholder="Ex.: Edição limitada"
              required
            />
          </label>

          <label className="admin-field">
            <span>Preço</span>
            <input
              className="admin-input"
              type="number"
              min="0"
              step="0.01"
              value={form.preco}
              onChange={(event) => updateField('preco', event.target.value)}
              placeholder="0,00"
              required
            />
          </label>

          <label className="admin-field">
            <span>Setor</span>
            <input
              className="admin-input"
              value={form.setor}
              onChange={(event) => updateField('setor', event.target.value)}
              placeholder="Ex.: Sala de jantar"
            />
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
            <span>Descrição</span>
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
            {preview ? <img src={preview} alt={form.nome || 'Pré-visualização do produto'} /> : <span>Preview da imagem</span>}
          </div>

          <div className="admin-upload-actions">
            <label className="admin-upload-dropzone">
              <input
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const nextFile = event.target.files?.[0] || null
                  setImageFile(nextFile)
                  setRemoveImage(false)
                }}
              />
              <UploadIcon className="admin-inline-icon" />
              <div>
                <strong>Enviar imagem</strong>
                <p>PNG, JPG ou WEBP para a linha do produto.</p>
              </div>
            </label>

            {(form.imagem || imageFile) && (
              <button
                type="button"
                className="admin-btn admin-btn-ghost"
                onClick={() => {
                  setImageFile(null)
                  setPreview('')
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
            {saving ? 'Salvando...' : product ? 'Salvar alterações' : 'Criar produto'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
