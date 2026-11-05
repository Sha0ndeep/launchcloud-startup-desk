import { Card } from './ui/Card'

/** Plain-language explanation of what evidence means in this program. Shown on the application form and reply form. */
export function EvidencePolicyNotes({ policyVersion }: { policyVersion: string }) {
  return (
    <Card title="How evidence works" subtitle={`Demo policy ${policyVersion}`}>
      <ul className="rule-list">
        <li>Founding year, headcount and funding you declare are recorded as timestamped applicant declarations, accepted under policy {policyVersion}. They are not labeled "verified".</li>
        <li>Company research (Crustdata and web sources) adds provider observations as corroboration. It is professional and company intelligence, not a payroll or funding audit.</li>
        <li>If external research is unconfigured or fails, enrollment is held until an operator restores it. Nothing is guessed and no synthetic provider data is inserted.</li>
        <li>Leave a number blank if you do not know it. Missing funding is treated as unknown, never as zero, and we will ask you for it.</li>
        <li>If a public record disagrees with your declaration, you get a clarification request. A conflict is not an accusation and does not establish fraud.</li>
        <li>Links you supply are recorded as applicant-supplied sources; their content is not automatically trusted.</li>
        <li>Issued credits are LaunchCloud promotional product credits, not Crustdata credits and not cash.</li>
      </ul>
    </Card>
  )
}
