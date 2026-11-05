import { EmptyState } from '../components/ui/EmptyState'
import { Link } from '../components/ui/Link'
import { routes } from '../lib/router'

export function NotFoundPage() {
  return (
    <div className="page">
      <EmptyState
        title="Page not found"
        description="This desk has four areas: apply, my application, product account and the operator desk."
        action={
          <Link to={routes.home} className="btn btn-secondary btn-md">
            Back to start
          </Link>
        }
      />
    </div>
  )
}
