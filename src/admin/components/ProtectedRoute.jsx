import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthSession } from '../AuthContext.jsx'

function AdminLoader() {
  return (
    <div className="admin-loader-screen">
      <div className="admin-loader-card">
        <span className="admin-kicker">Decoratie Admin</span>
        <h1>Verificando acesso...</h1>
        <p>Estamos confirmando sua autenticação e carregando o painel.</p>
      </div>
    </div>
  )
}

export default function ProtectedRoute() {
  const location = useLocation()
  const { initializing, user } = useAuthSession()

  if (initializing) {
    return <AdminLoader />
  }

  if (!user) {
    const nextPath = `${location.pathname}${location.search}`
    return <Navigate replace to={`/login?next=${encodeURIComponent(nextPath)}`} />
  }

  return <Outlet />
}
