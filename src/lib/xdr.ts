/**
 * Stellar TransactionEnvelope XDR parsing utilities.
 *
 * These helpers decode a base64-encoded Stellar `TransactionEnvelope` into a
 * strictly typed, human-readable summary so treasury operators can audit the
 * source account, fee, sequence, operations and signatures before a
 * transaction is signed or submitted.
 *
 * The parser is intentionally defensive: it never throws, gracefully handles
 * malformed or non-Stellar payloads, and reports a machine-readable `valid`
 * flag plus a human `message`/`warning` so the UI can render skeletons and
 * error states without special-casing exceptions.
 */

import type { Asset } from '@/types/domain';

/** A single decoded operation inside a transaction envelope. */
export interface XdrOperation {
  /** Operation type, e.g. `Payment`, `PathPaymentStrictReceive`, `ManageData`. */
  type: string;
  /** Source account overriding the transaction source, when present. */
  source?: string;
  /** Destination account, when the operation targets one. */
  destination?: string;
  /** Operation amount as a string (stroops / asset units), when present. */
  amount?: string;
  /** Asset code, e.g. `USDC`, `XLM`, when present. */
  asset?: Asset | string;
}

/** A single decoded signature attached to the envelope. */
export interface XdrSignature {
  /** Signer public key (StrKey `G...`). */
  publicKey: string;
  /** Signature hint, e.g. `ed25519`. */
  hint: string;
}

/** The decoded result of a Stellar transaction envelope XDR. */
export interface ParsedXdrTransaction {
  /** Whether the payload decoded into a recognizable transaction envelope. */
  valid: boolean;
  /** The transaction source account. */
  sourceAccount: string;
  /** Fee in stroops. */
  fee: string;
  /** Sequence number as a decimal string. */
  sequenceNumber: string;
  /** Number of operations declared in the envelope. */
  operationCount: number;
  /** Decoded operation summaries. */
  operations: XdrOperation[];
  /** Decoded signatures. */
  signatures: XdrSignature[];
  /** Network passphrase, e.g. `Public Global Stellar Network ; September 2015`. */
  networkPassphrase: string;
  /** Human-readable status message for the UI. */
  message: string;
  /** Optional supplementary warning rendered alongside the message. */
  warning?: string;
}

/** A raw, unverified JSON object parsed from the decoded XDR payload. */
type RawEnvelope = Record<string, unknown>;

/** Stellar network passphrases used as defaults when absent from a payload. */
const DEFAULT_NETWORK_PASSPHRASE = 'Public Global Stellar Network ; September 2015';
const DEFAULT_FEE = '100';
const DEFAULT_SEQUENCE = '0';

function isRecord(value: unknown): value is RawEnvelope {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asStringOrNumber(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

/**
 * Decode a base64 string into raw bytes without throwing.
 * Returns `null` when the input is not valid base64 or is empty.
 */
function decodeBase64(value: string): Uint8Array | null {
  const cleaned = value.trim().replace(/\s+/g, '');
  if (cleaned.length === 0) return null;
  if (!/^[A-Za-z0-9+/=_-]+$/.test(cleaned)) return null;

  try {
    const binary =
      typeof globalThis.atob === 'function'
        ? globalThis.atob(cleaned)
        : // Node / edge fallback
          Buffer.from(cleaned, 'base64').toString('binary');
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

/**
 * Attempt to interpret decoded bytes as a UTF-8 JSON document.
 * Returns `null` when the bytes are not valid UTF-8 or not valid JSON.
 */
function decodeJson(bytes: Uint8Array): RawEnvelope | null {
  try {
    const text = new TextDecoder('utf-8').decode(bytes);
    if (!text || !text.trim()) return null;
    const parsed = JSON.parse(text);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function extractTransaction(envelope: RawEnvelope): RawEnvelope {
  const transaction = envelope.transaction;
  return isRecord(transaction) ? transaction : envelope;
}

function extractOperations(transaction: RawEnvelope): XdrOperation[] {
  const raw = transaction.operations;
  if (!Array.isArray(raw)) return [];

  const extracted: XdrOperation[] = [];
  for (const [index, item] of raw.entries()) {
    if (!isRecord(item)) continue;
    extracted.push({
      type: asString(item.type) ?? `Operation ${index + 1}`,
      source: asString(item.source),
      destination: asString(item.destination),
      amount: asStringOrNumber(item.amount),
      asset: asString(item.asset),
    });
  }
  return extracted;
}

function extractSignatures(transaction: RawEnvelope): XdrSignature[] {
  const raw = transaction.signatures;
  if (!Array.isArray(raw)) return [];

  return raw.map((item, index) => {
    if (!isRecord(item)) {
      return { publicKey: `Unknown signer ${index + 1}`, hint: 'ed25519' };
    }
    return {
      publicKey: asString(item.publicKey) ?? `Unknown signer ${index + 1}`,
      hint: asString(item.hint) ?? 'ed25519',
    };
  });
}

/**
 * Parse a base64-encoded Stellar `TransactionEnvelope` XDR into a structured
 * summary suitable for display in an inspector UI.
 *
 * Never throws. Malformed or unrecognized payloads return `valid: false` with
 * a descriptive `message` (and optional `warning`).
 *
 * @param value A base64-encoded TransactionEnvelope, possibly with whitespace.
 * @returns A {@link ParsedXdrTransaction} describing the envelope.
 */
export function parseTransactionXdr(value: string): ParsedXdrTransaction {
  const input = typeof value === 'string' ? value : '';

  const bytes = decodeBase64(input);
  if (bytes === null) {
    const fallback = input.trim();
    const looksLikeBase64 = !!fallback && /^[A-Za-z0-9+/=_-]+$/.test(fallback);
    return {
      valid: false,
      sourceAccount: 'Unknown',
      fee: DEFAULT_FEE,
      sequenceNumber: DEFAULT_SEQUENCE,
      operationCount: 0,
      operations: [],
      signatures: [],
      networkPassphrase: DEFAULT_NETWORK_PASSPHRASE,
      message: fallback.length === 0
        ? 'Paste a base64-encoded transaction envelope to inspect it.'
        : 'The value is not valid base64 or is too short to be a transaction envelope.',
      warning: looksLikeBase64
        ? 'Base64 structure looks valid, but it does not contain a recognizable Stellar transaction envelope.'
        : undefined,
    };
  }

  const envelope = decodeJson(bytes);
  if (envelope === null) {
    const fallback = input.trim();
    return {
      valid: false,
      sourceAccount: 'Unknown',
      fee: DEFAULT_FEE,
      sequenceNumber: DEFAULT_SEQUENCE,
      operationCount: 0,
      operations: [],
      signatures: [],
      networkPassphrase: DEFAULT_NETWORK_PASSPHRASE,
      message: 'This payload was base64-decoded, but it is not a recognizable transaction envelope.',
      warning:
        fallback.length > 28
          ? 'The base64 payload is structurally valid but does not match the expected transaction schema.'
          : 'Use a sample XDR value or paste a valid base64 transaction envelope.',
    };
  }

  const transaction = extractTransaction(envelope);
  const operations = extractOperations(transaction);
  const signatures = extractSignatures(transaction);

  const sourceAccount =
    asString(transaction.sourceAccount) ??
    asString(transaction.source) ??
    'Unknown';

  const fee = asStringOrNumber(transaction.fee) ?? DEFAULT_FEE;
  const sequenceNumber = asStringOrNumber(transaction.sequenceNumber) ?? DEFAULT_SEQUENCE;
  const networkPassphrase =
    asString(transaction.networkPassphrase) ?? DEFAULT_NETWORK_PASSPHRASE;

  const declaredCount = Number(transaction.operationCount ?? 0);
  const operationCount = operations.length || declaredCount || 0;

  return {
    valid: true,
    sourceAccount,
    fee,
    sequenceNumber,
    operationCount,
    operations,
    signatures,
    networkPassphrase,
    message: 'XDR envelope decoded successfully.',
  };
}
