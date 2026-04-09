import { useEffect } from 'react'
import XmlImportadorApp from '../../xml-importador-produtos/frontend/src/App.jsx'
import '../../xml-importador-produtos/frontend/src/index.css'

export default function AdminPage() {
  useEffect(() => {
    document.body.classList.add('admin-mode')
    return () => document.body.classList.remove('admin-mode')
  }, [])
  return <XmlImportadorApp />
}
