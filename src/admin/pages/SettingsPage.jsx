import { useEffect, useState } from 'react'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../../lib/firebaseClient.js'
import { defaultSettings } from '../../data/siteDefaults.js'
import { useAdminUI } from '../components/AdminLayout.jsx'
import { useDocumentData } from '../hooks/useFirestoreData.js'

export default function SettingsPage() {
  const { data: remoteSettings, loading } = useDocumentData('configuracoes', 'geral', defaultSettings)
  const { notify } = useAdminUI()
  const [form, setForm] = useState(defaultSettings)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!loading && !dirty) {
      setForm({
        ...defaultSettings,
        ...remoteSettings,
      })
    }
  }, [dirty, loading, remoteSettings])

  function updateField(field, value) {
    setDirty(true)
    setForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)

    try {
      await setDoc(
        doc(db, 'configuracoes', 'geral'),
        {
          ...form,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )

      setDirty(false)

      notify({
        type: 'success',
        title: 'Configurações salvas',
        description: 'Links e preferências básicas foram atualizados.',
      })
    } catch (error) {
      notify({
        type: 'error',
        title: 'Não foi possível salvar as configurações',
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
          <span className="admin-kicker">Configurações</span>
          <h1>Links, CTA padrão e operação básica.</h1>
          <p>Mantenha o ecossistema da marca alinhado em um único lugar.</p>
        </div>
      </div>

      <form className="admin-surface admin-form" onSubmit={handleSubmit}>
        <div className="admin-form-grid">
          <label className="admin-field">
            <span>Link do WhatsApp</span>
            <input
              className="admin-input"
              value={form.whatsappLink}
              onChange={(event) => updateField('whatsappLink', event.target.value)}
              placeholder="https://wa.me/55..."
            />
          </label>

          <label className="admin-field">
            <span>Link do Instagram</span>
            <input
              className="admin-input"
              value={form.instagramLink}
              onChange={(event) => updateField('instagramLink', event.target.value)}
              placeholder="https://instagram.com/decoratie"
            />
          </label>

          <label className="admin-field">
            <span>Link do grupo VIP</span>
            <input
              className="admin-input"
              value={form.vipGroupLink}
              onChange={(event) => updateField('vipGroupLink', event.target.value)}
              placeholder="https://chat.whatsapp.com/..."
            />
          </label>

          <label className="admin-field">
            <span>Texto padrão do CTA</span>
            <input
              className="admin-input"
              value={form.ctaDefaultText}
              onChange={(event) => updateField('ctaDefaultText', event.target.value)}
              placeholder="Quero conhecer"
            />
          </label>

          <label className="admin-field">
            <span>Status do sistema</span>
            <select
              className="admin-select"
              value={form.systemStatus}
              onChange={(event) => updateField('systemStatus', event.target.value)}
            >
              <option value="online">Online</option>
              <option value="pausado">Pausado</option>
              <option value="manutencao">Manutenção</option>
            </select>
          </label>

          <label className="admin-field admin-field-full">
            <span>Tagline da marca</span>
            <textarea
              className="admin-textarea"
              rows="4"
              value={form.brandTagline}
              onChange={(event) => updateField('brandTagline', event.target.value)}
            />
          </label>
        </div>

        <div className="admin-form-actions">
          <button type="submit" className="admin-btn" disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar configurações'}
          </button>
        </div>
      </form>
    </section>
  )
}
