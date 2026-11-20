import test from 'node:test';
import assert from 'node:assert/strict';

import { parseTransactionXdr } from '@/lib/xdr';

const VALID_PAYMENT_XDR = Buffer.from(
  JSON.stringify({
    type: 'TransactionEnvelope',
    sourceAccount: 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H',
    fee: '100',
    sequenceNumber: '2147483649',
    operationCount: 2,
    networkPassphrase: 'Public Global Stellar Network ; September 2015',
    operations: [
      {
        type: 'Payment',
        source: 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H',
        destination: 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ',
        amount: '125.50',
        asset: 'USDC',
      },
      {
        type: 'ManageData',
        source: 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H',
      },
    ],
    signatures: [
      {
        publicKey: 'GD2E5MGVZ4XGIVLNCF4YBZV3JR5M2U3A2P6Q4Y4M7P6KOCZQ7W6I3Q4',
        hint: 'ed25519',
      },
    ],
  }),
).toString('base64');

const VALID_TESTNET_XDR = Buffer.from(
  JSON.stringify({
    type: 'TransactionEnvelope',
    sourceAccount: 'GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2',
    fee: '200',
    sequenceNumber: '314159265',
    operationCount: 1,
    networkPassphrase: 'Test SDF Network ; September 2015',
    operations: [
      {
        type: 'PathPaymentStrictReceive',
        destination: 'GB3JQK3ZXB5UYT4GSLFG2ICG7Q5F2KZ3RD5VJN4TQ6Q5Q2SS7EJQADYQ',
        amount: '250.00',
        asset: 'XLM',
      },
    ],
    signatures: [],
  }),
).toString('base64');

test('parseTransactionXdr decodes a valid mainnet payment envelope', () => {
  const result = parseTransactionXdr(VALID_PAYMENT_XDR);

  assert.strictEqual(result.valid, true);
  assert.strictEqual(
    result.sourceAccount,
    'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H',
  );
  assert.strictEqual(result.fee, '100');
  assert.strictEqual(result.sequenceNumber, '2147483649');
  assert.strictEqual(
    result.networkPassphrase,
    'Public Global Stellar Network ; September 2015',
  );
  assert.strictEqual(result.operationCount, 2);
  assert.strictEqual(result.operations.length, 2);
  assert.deepStrictEqual(result.operations[0], {
    type: 'Payment',
    source: 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H',
    destination: 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ',
    amount: '125.50',
    asset: 'USDC',
  });
  assert.strictEqual(result.operations[1].type, 'ManageData');
  assert.strictEqual(result.signatures.length, 1);
  assert.strictEqual(result.signatures[0].hint, 'ed25519');
  assert.strictEqual(result.message, 'XDR envelope decoded successfully.');
  assert.strictEqual(result.warning, undefined);
});

test('parseTransactionXdr honors a testnet network passphrase', () => {
  const result = parseTransactionXdr(VALID_TESTNET_XDR);

  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.networkPassphrase, 'Test SDF Network ; September 2015');
  assert.strictEqual(result.operations[0].type, 'PathPaymentStrictReceive');
  assert.strictEqual(result.signatures.length, 0);
});

test('parseTransactionXdr normalizes whitespace inside base64', () => {
  const spaced = VALID_PAYMENT_XDR.replace(/(.{20})/g, '$1 ');
  const result = parseTransactionXdr(spaced);

  assert.strictEqual(result.valid, true);
  assert.strictEqual(
    result.sourceAccount,
    'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H',
  );
});

test('parseTransactionXdr never throws on empty or non-string input', () => {
  for (const input of ['', '   ', null as unknown as string, undefined as unknown as string]) {
    assert.doesNotThrow(() => parseTransactionXdr(input));
    const result = parseTransactionXdr(input);
    assert.strictEqual(result.valid, false);
    assert.ok(result.message.length > 0);
  }
});

test('parseTransactionXdr rejects non-base64 garbage input', () => {
  const result = parseTransactionXdr('!!!not-valid-base64!!!');
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.operations.length, 0);
  assert.strictEqual(result.signatures.length, 0);
});

test('parseTransactionXdr rejects valid base64 that is not a transaction envelope', () => {
  const randomBase64 = Buffer.from(
    'hello world, this is not a transaction envelope',
  ).toString('base64');
  const result = parseTransactionXdr(randomBase64);
  assert.strictEqual(result.valid, false);
  assert.ok(result.warning);
});

test('parseTransactionXdr derives operation count from the operations array', () => {
  const noCount = Buffer.from(
    JSON.stringify({
      type: 'TransactionEnvelope',
      sourceAccount: 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H',
      operations: [
        { type: 'Payment', destination: 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ' },
        { type: 'Payment', destination: 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ' },
        { type: 'Payment', destination: 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ' },
      ],
    }),
  ).toString('base64');
  const result = parseTransactionXdr(noCount);
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.operationCount, 3);
  assert.strictEqual(result.operations.length, 3);
});
