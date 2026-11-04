import { formatFullDate } from '../date'
import type { Confidence, MetadataObject, TokenEstimate } from '../metadata'
import { DateLabel } from './DateLabel'

const count = new Intl.NumberFormat()

const CONFIDENCE_TEXT: Record<Confidence, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
}

const CONFIDENCE_HINT: Record<Confidence, string> = {
  high: 'Under 1,000 tokens, so the estimate is fairly close',
  medium: 'Between 1,000 and 5,000 tokens, so the estimate may be off',
  low: 'Over 5,000 tokens, so treat the estimate as a rough guess',
}

// Log scale: most prompts are a few hundred tokens, which a linear scale would squash against zero.
const SCALE_MAX = 20_000
const position = (tokens: number) =>
  Math.min(100, (Math.log10(Math.max(tokens, 1)) / Math.log10(SCALE_MAX)) * 100)

export const formatRange = ({ min, max }: TokenEstimate) =>
  min === max ? `${count.format(min)} tokens` : `${count.format(min)}–${count.format(max)} tokens`

/**
 * The estimated range drawn on a log scale, with ticks where confidence drops
 * (1,000 and 5,000 tokens). Width of the fill is the uncertainty.
 */
export function TokenGauge({ estimate, scale = false }: { estimate: TokenEstimate; scale?: boolean }) {
  const left = position(estimate.min)
  const width = position(estimate.max) - left
  return (
    <div className="token-gauge" data-confidence={estimate.confidence}>
      <div
        className="gauge-track"
        role="img"
        aria-label={`Estimated ${formatRange(estimate)}, ${CONFIDENCE_TEXT[estimate.confidence].toLowerCase()}`}
        title={CONFIDENCE_HINT[estimate.confidence]}
      >
        <span className="gauge-tick" style={{ left: `${position(1000)}%` }} />
        <span className="gauge-tick" style={{ left: `${position(5000)}%` }} />
        <span className="gauge-fill" style={{ left: `${left}%`, width: `${width}%` }} />
      </div>
      {scale && (
        <div className="gauge-scale" aria-hidden="true">
          <span style={{ left: 0 }}>0</span>
          <span style={{ left: `${position(1000)}%` }}>1k</span>
          <span style={{ left: `${position(5000)}%` }}>5k</span>
        </div>
      )}
    </div>
  )
}

/** Card line: model on the left, the range on the right, gauge underneath. */
export function CardMetadata({ metadata }: { metadata: MetadataObject }) {
  return (
    <div className="card-metadata">
      <div className="card-metadata-line">
        <span className="model-name" title={metadata.model}>
          {metadata.model}
        </span>
        <span className="token-range">{formatRange(metadata.tokenEstimate)}</span>
      </div>
      <TokenGauge estimate={metadata.tokenEstimate} />
    </div>
  )
}

/** "Added Nov 4", plus ", updated 2 hours ago" once the two differ. */
export function MetadataDates({ metadata }: { metadata: MetadataObject }) {
  const created = Date.parse(metadata.createdAt)
  const updated = Date.parse(metadata.updatedAt)
  return (
    <span className="metadata-dates">
      <DateLabel prefix="Added" ms={created} />
      {updated > created && (
        <>
          <span aria-hidden="true">,</span> <DateLabel prefix="updated" ms={updated} />
        </>
      )}
    </span>
  )
}

function FullDate({ iso }: { iso: string }) {
  return (
    <time className="full-date" dateTime={iso}>
      {formatFullDate(Date.parse(iso))}
    </time>
  )
}

/** Catalogue-style entry for the details dialog. */
export function MetadataSummary({ metadata }: { metadata: MetadataObject }) {
  const { tokenEstimate } = metadata
  return (
    <dl className="metadata-list">
      <div className="metadata-model">
        <dt>Model</dt>
        <dd className="model-name">{metadata.model}</dd>
      </div>
      <div className="metadata-tokens" data-confidence={tokenEstimate.confidence}>
        <dt>Token estimate</dt>
        <dd>
          <span className="token-range">{formatRange(tokenEstimate)}</span>
          <span className="confidence-text">{CONFIDENCE_TEXT[tokenEstimate.confidence]}</span>
          <TokenGauge estimate={tokenEstimate} scale />
        </dd>
      </div>
      <div>
        <dt>Created</dt>
        <dd>
          <FullDate iso={metadata.createdAt} />
        </dd>
      </div>
      <div>
        <dt>Updated</dt>
        <dd>
          {metadata.updatedAt === metadata.createdAt ? (
            <span className="unchanged">Not changed</span>
          ) : (
            <FullDate iso={metadata.updatedAt} />
          )}
        </dd>
      </div>
    </dl>
  )
}
