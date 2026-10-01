/** Collection feedback stays separate from detail/workflow errors. */
export function SessionListStatus({ isLoading, hasLoaded, error, onRefresh }) {
  return (
    <div className="session-list-status">
      <p role={error ? 'alert' : 'status'}>
        {isLoading
          ? hasLoaded ? 'Refreshing sessions. Showing previously loaded data.' : 'Loading sessions…'
          : error
            ? hasLoaded ? 'Could not refresh sessions. Showing previously loaded data.' : 'Sessions are unavailable. Could not load data from the backend.'
            : 'Sessions are up to date.'}
      </p>
      {onRefresh && (
        <button type="button" className="btn btn--outline btn--small" onClick={onRefresh} disabled={isLoading}>
          {isLoading ? 'Loading…' : error ? 'Retry' : 'Refresh'}
        </button>
      )}
    </div>
  )
}
