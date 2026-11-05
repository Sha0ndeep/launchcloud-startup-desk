import { useState } from 'react'
import { api, type Auth } from '../api'
import { toApiError } from '../api/errors'
import { downloadJson, safeFilenamePart } from '../lib/download'
import { pushToast } from '../lib/toastStore'
import { Button } from './ui/Button'
import { ErrorNotice } from './ui/ErrorNotice'

/** Fetches GET /api/applications/{id}/report and saves it as a JSON file. */
export function ExportCaseButton({ applicationId, auth, label = 'Export case JSON' }: { applicationId: string; auth: Auth; label?: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      const report = await api.getReport(applicationId, auth)
      downloadJson(`launchcloud-case-${safeFilenamePart(applicationId)}.json`, report)
      pushToast({ tone: 'success', title: 'Case export downloaded', message: 'The JSON is exactly what the backend returned from /report.' })
    } catch (err) {
      setError(toApiError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack-sm">
      <Button onClick={run} loading={busy}>
        {label}
      </Button>
      {error !== null && <ErrorNotice error={error} compact onRetry={run} />}
    </div>
  )
}
