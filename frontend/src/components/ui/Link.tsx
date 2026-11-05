import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react'
import { navigate, usePath } from '../../lib/router'

interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  to: string
  children: ReactNode
  /** Adds aria-current when the current path matches. */
  nav?: boolean
}

export function Link({ to, children, nav = false, onClick, className = '', ...rest }: LinkProps) {
  const path = usePath()
  const current = nav && (path === to || (to !== '/' && path.startsWith(`${to}/`)))
  const handle = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event)
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    navigate(to)
  }
  return (
    <a href={to} onClick={handle} className={className} aria-current={current ? 'page' : undefined} {...rest}>
      {children}
    </a>
  )
}
