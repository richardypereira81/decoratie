import { useEffect, useState } from 'react'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../../lib/firebaseClient.js'
import { defaultLandingContent } from '../../data/siteDefaults.js'
import { removeStoredFile, uploadImage } from '../../lib/storageUploads.js'
import { useAdminUI } from '../components/AdminLayout.jsx'
import { UploadIcon } from '../components/AdminIcons.jsx'
import { useDocumentData } from '../hooks/useFirestoreData.js'

function ImageField({ label, preview, onFileChange, onRemove }) {
  return (
    <div className="admin-image-field">
      <div className="admin-image-frame">
        {preview ? <img src={preview} alt={label} /> : <span>{label}</span>}
      </div>

      <div className="admin-image-actions">
        <label className="admin-upload-dropzone">
          <input type="file" accept="image/*" onChange={onFileChange} />
          <UploadIcon className="admin-inline-icon" />
          <div>
            <strong>Enviar imagem</strong>
            <p>{label}</p>
          </div>
        </label>

        {preview ? (
          <button type="button" className="admin-btn admin-btn-ghost" onClick={onRemove}>
            Remover imagem
          </button>
        ) : null}
      </div>
    </div>
  )
}

export default function ContentPage() {
  const { data: remoteContent, loading } = useDocumentData('conteudo', 'landing', defaultLandingContent)
  const { notify } = useAdminUI()
  const [form, setForm] = useState(defaultLandingContent)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [files, setFiles] = useState({
    heroImage: null,
    emotionalImage: null,
    exclusivityImage: null,
  })
  const [removedImages, setRemovedImages] = useState({
    heroImage: false,
    emotionalImage: false,
    exclusivityImage: false,
  })
  const [previews, setPreviews] = useState({
    heroImage: '',
    emotionalImage: '',
    exclusivityImage: '',
  })

  useEffect(() => {
    if (!loading && !dirty) {
      setForm({
        ...defaultLandingContent,
        ...remoteContent,
      })
    }
  }, [dirty, loading, remoteContent])

  useEffect(() => {
    const generatedUrls = []
    const nextPreviews = {}

    for (const field of ['heroImage', 'emotionalImage', 'exclusivityImage']) {
      if (files[field]) {
        const objectUrl = URL.createObjectURL(files[field])
        generatedUrls.push(objectUrl)
        nextPreviews[field] = objectUrl
      } else {
        nextPreviews[field] = form[field]
      }
    }

    setPreviews(nextPreviews)

    return () => {
      generatedUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [files, form.heroImage, form.emotionalImage, form.exclusivityImage])

  function updateField(field, value) {
    setDirty(true)
    setForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  function setImageFile(field, file) {
    setDirty(true)
    setFiles((current) => ({
      ...current,
      [field]: file,
    }))
    setRemovedImages((current) => ({
      ...current,
      [field]: false,
    }))
  }

  function removeImage(field) {
    setDirty(true)
    setFiles((current) => ({
      ...current,
      [field]: null,
    }))
    setRemovedImages((current) => ({
      ...current,
      [field]: true,
    }))
    setForm((current) => ({
      ...current,
      [field]: '',
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)

    try {
      const nextContent = { ...form }

      for (const field of ['heroImage', 'emotionalImage', 'exclusivityImage']) {
        const pathField = `${field}Path`

        if (removedImages[field] && remoteContent[pathField]) {
          await removeStoredFile(remoteContent[pathField])
          nextContent[field] = ''
          nextContent[pathField] = ''
        }

        if (files[field]) {
          const uploaded = await uploadImage(files[field], `content/${field}`)

          if (remoteContent[pathField] && remoteContent[pathField] !== uploaded.path) {
            await removeStoredFile(remoteContent[pathField])
          }

          nextContent[field] = uploaded.url
          nextContent[pathField] = uploaded.path
        }
      }

      await setDoc(
        doc(db, 'conteudo', 'landing'),
        {
          ...nextContent,
          exclusivityRemaining: Number(nextContent.exclusivityRemaining) || 0,
          exclusivityTotal: Number(nextContent.exclusivityTotal) || 0,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )

      setDirty(false)
      setFiles({
        heroImage: null,
        emotionalImage: null,
        exclusivityImage: null,
      })
      setRemovedImages({
        heroImage: false,
        emotionalImage: false,
        exclusivityImage: false,
      })

      notify({
        type: 'success',
        title: 'Conteúdo atualizado',
        description: 'A landing já pode refletir essa nova versão.',
      })
    } catch (error) {
      notify({
        type: 'error',
        title: 'Não foi possível salvar o conteúdo',
        description: error.message || 'Tente novamente.',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="admin-page-section">
      <div className="admin-page-header">
        <div>
          <span className="admin-kicker">Conteúdo</span>
          <h1>Edite a landing sem tocar no código.</h1>
          <p>Hero, narrativa emocional, CTA e exclusividade permanecem consistentes com a marca.</p>
        </div>
      </div>

      <form className="admin-surface admin-form" onSubmit={handleSubmit}>
        <div className="admin-surface-head">
          <div>
            <span className="admin-kicker">Textos principais</span>
            <h2>Mensagem e posicionamento</h2>
          </div>
        </div>

        <div className="admin-form-grid">
          <label className="admin-field admin-field-full">
            <span>Headline do hero</span>
            <textarea
              className="admin-textarea"
              rows="3"
              value={form.heroTitle}
              onChange={(event) => updateField('heroTitle', event.target.value)}
              placeholder="Sua mesa nunca mais será comum."
            />
          </label>

          <label className="admin-field admin-field-full">
            <span>Subheadline</span>
            <textarea
              className="admin-textarea"
              rows="4"
              value={form.heroSubtitle}
              onChange={(event) => updateField('heroSubtitle', event.target.value)}
            />
          </label>

          <label className="admin-field admin-field-full">
            <span>Texto emocional</span>
            <textarea
              className="admin-textarea"
              rows="5"
              value={form.emotionalText}
              onChange={(event) => updateField('emotionalText', event.target.value)}
            />
          </label>

          <label className="admin-field">
            <span>CTA principal</span>
            <input
              className="admin-input"
              value={form.ctaText}
              onChange={(event) => updateField('ctaText', event.target.value)}
              placeholder="Quero transformar minha mesa"
            />
          </label>

          <label className="admin-field">
            <span>Título da seção CTA</span>
            <input
              className="admin-input"
              value={form.ctaTitle}
              onChange={(event) => updateField('ctaTitle', event.target.value)}
            />
          </label>

          <label className="admin-field admin-field-full">
            <span>Subtexto do CTA</span>
            <textarea
              className="admin-textarea"
              rows="3"
              value={form.ctaSubtitle}
              onChange={(event) => updateField('ctaSubtitle', event.target.value)}
            />
          </label>
        </div>

        <div className="admin-divider" />

        <div className="admin-surface-head">
          <div>
            <span className="admin-kicker">Exclusividade</span>
            <h2>Seção de escassez e desejo</h2>
          </div>
        </div>

        <div className="admin-form-grid">
          <label className="admin-field admin-field-full">
            <span>Título da exclusividade</span>
            <textarea
              className="admin-textarea"
              rows="3"
              value={form.exclusivityTitle}
              onChange={(event) => updateField('exclusivityTitle', event.target.value)}
            />
          </label>

          <label className="admin-field admin-field-full">
            <span>Texto da exclusividade</span>
            <textarea
              className="admin-textarea"
              rows="4"
              value={form.exclusivityText}
              onChange={(event) => updateField('exclusivityText', event.target.value)}
            />
          </label>

          <label className="admin-field">
            <span>Nome da coleção</span>
            <input
              className="admin-input"
              value={form.exclusivityCollection}
              onChange={(event) => updateField('exclusivityCollection', event.target.value)}
            />
          </label>

          <label className="admin-field">
            <span>Peças restantes</span>
            <input
              className="admin-input"
              type="number"
              min="0"
              value={form.exclusivityRemaining}
              onChange={(event) => updateField('exclusivityRemaining', event.target.value)}
            />
          </label>

          <label className="admin-field">
            <span>Total de peças</span>
            <input
              className="admin-input"
              type="number"
              min="1"
              value={form.exclusivityTotal}
              onChange={(event) => updateField('exclusivityTotal', event.target.value)}
            />
          </label>
        </div>

        <div className="admin-divider" />

        <div className="admin-surface-head">
          <div>
            <span className="admin-kicker">Imagens da landing</span>
            <h2>Atualize o visual sem perder o refinamento</h2>
          </div>
        </div>

        <div className="admin-image-grid">
          <ImageField
            label="Imagem do hero"
            preview={previews.heroImage}
            onFileChange={(event) => setImageFile('heroImage', event.target.files?.[0] || null)}
            onRemove={() => removeImage('heroImage')}
          />
          <ImageField
            label="Imagem da seção emocional"
            preview={previews.emotionalImage}
            onFileChange={(event) => setImageFile('emotionalImage', event.target.files?.[0] || null)}
            onRemove={() => removeImage('emotionalImage')}
          />
          <ImageField
            label="Imagem da exclusividade"
            preview={previews.exclusivityImage}
            onFileChange={(event) => setImageFile('exclusivityImage', event.target.files?.[0] || null)}
            onRemove={() => removeImage('exclusivityImage')}
          />
        </div>

        <div className="admin-form-actions">
          <button type="submit" className="admin-btn" disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar conteúdo'}
          </button>
        </div>
      </form>
    </section>
  )
}
