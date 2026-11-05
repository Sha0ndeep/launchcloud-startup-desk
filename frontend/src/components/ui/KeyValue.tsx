import type { ReactNode } from 'react'

export interface KeyValueItem {
  key: string
  label: ReactNode
  value: ReactNode
  mono?: boolean
}

export function KeyValue({ items, columns = 1 }: { items: KeyValueItem[]; columns?: 1 | 2 }) {
  return (
    <dl className={`kv kv-cols-${columns}`}>
      {items.map((item) => (
        <div className="kv-row" key={item.key}>
          <dt>{item.label}</dt>
          <dd className={item.mono ? 'mono' : undefined}>{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
