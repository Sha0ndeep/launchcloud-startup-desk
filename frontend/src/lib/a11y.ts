/** Builds an aria-describedby value from the hint/error ids that <Field> renders. */
export function describedBy(id: string, hasHint: boolean, hasError: boolean): string | undefined {
  const ids = [hasHint ? `${id}-hint` : null, hasError ? `${id}-error` : null].filter(Boolean)
  return ids.length ? ids.join(' ') : undefined
}
