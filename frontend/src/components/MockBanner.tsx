export function MockBanner() {
  return (
    <div className="mock-banner" role="status">
      <strong>MOCK BACKEND MODE.</strong> Every application, message, evidence item and balance on this screen is a frontend fixture
      (<code>VITE_USE_MOCK_API=true</code>). No research runs, no mail is sent and no credits are real. Fixture operator token: <code>demo-operator</code>.
    </div>
  )
}
