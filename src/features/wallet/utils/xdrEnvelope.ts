import {
  parseTransactionXdr,
  type ParsedXdrTransaction,
  type XdrOperation,
  type XdrSignature,
} from '@/lib/xdr';

/**
 * A single decoded operation inside a transaction envelope.
 * @deprecated Use {@link XdrOperation} from `@/lib/xdr` instead.
 */
export interface OperationSummary extends XdrOperation {}

/** A single decoded signature attached to the envelope. */
export interface SignatureSummary extends XdrSignature {}

/**
 * The decoded result of a Stellar transaction envelope XDR.
 * @deprecated Use {@link ParsedXdrTransaction} from `@/lib/xdr` instead.
 */
export interface ParsedEnvelope extends ParsedXdrTransaction {}

/**
 * Parse a base64-encoded Stellar `TransactionEnvelope` XDR into a structured
 * summary suitable for display in an inspector UI.
 *
 * Never throws. Malformed or unrecognized payloads return `valid: false` with
 * a descriptive `message` (and optional `warning`).
 *
 * Delegates to the canonical parser in `@/lib/xdr`.
 *
 * @param value A base64-encoded TransactionEnvelope, possibly with whitespace.
 * @returns A {@link ParsedEnvelope} describing the envelope.
 */
export function parseEnvelope(value: string): ParsedEnvelope {
  return parseTransactionXdr(value) as ParsedEnvelope;
}

