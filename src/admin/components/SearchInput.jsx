import { useId } from 'react'
import { SearchIcon } from './AdminIcons.jsx'

export default function SearchInput({
  ariaLabel = 'Buscar registros',
  onChange,
  placeholder,
  value,
}) {
  const inputId = useId()

  return (
    <label className="admin-list-search" htmlFor={inputId}>
      <SearchIcon className="admin-inline-icon" />
      <input
        id={inputId}
        type="search"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        aria-label={ariaLabel}
      />
    </label>
  )
}
