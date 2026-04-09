import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useId, useRef, useState } from 'react'

const popoverTransition = {
  duration: 0.18,
  ease: [0.16, 1, 0.3, 1],
}

function joinClassNames(...values) {
  return values.filter(Boolean).join(' ')
}

export default function ToolbarDropdown({
  align = 'end',
  children,
  className = '',
  panelClassName = '',
  renderButton,
}) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const containerRef = useRef(null)

  useEffect(() => {
    if (!open) {
      return undefined
    }

    function handlePointerDown(event) {
      if (!containerRef.current?.contains(event.target)) {
        setOpen(false)
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  function close() {
    setOpen(false)
  }

  function toggle() {
    setOpen((current) => !current)
  }

  return (
    <div ref={containerRef} className={joinClassNames('admin-toolbar-dropdown', className)}>
      {renderButton({
        close,
        open,
        panelId,
        setOpen,
        toggle,
      })}

      <AnimatePresence>
        {open ? (
          <motion.div
            id={panelId}
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -6 }}
            transition={popoverTransition}
            className={joinClassNames(
              'admin-toolbar-popover',
              align === 'start' ? 'is-start' : 'is-end',
              panelClassName
            )}
          >
            {typeof children === 'function' ? children({ close }) : children}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
