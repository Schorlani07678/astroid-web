import assert from 'node:assert/strict';
import test from 'node:test';
import { isSafeHref, parseInline, parseMarkdown } from './markdown';

test('bold, italic and inline code are parsed into typed nodes', () => {
  assert.deepEqual(parseInline('Spend is **up 12%** on *Tuesday* via `pay_agent`'), [
    { type: 'text', value: 'Spend is ' },
    { type: 'strong', children: [{ type: 'text', value: 'up 12%' }] },
    { type: 'text', value: ' on ' },
    { type: 'em', children: [{ type: 'text', value: 'Tuesday' }] },
    { type: 'text', value: ' via ' },
    { type: 'code', value: 'pay_agent' },
  ]);
});

test('formatting nests inside bold', () => {
  assert.deepEqual(parseInline('**Total `42 XLM`**'), [
    {
      type: 'strong',
      children: [
        { type: 'text', value: 'Total ' },
        { type: 'code', value: '42 XLM' },
      ],
    },
  ]);
});

test('underscores inside identifiers are not treated as emphasis', () => {
  assert.deepEqual(parseInline('check daily_spend_limit now'), [
    { type: 'text', value: 'check daily_spend_limit now' },
  ]);
});

test('unclosed delimiters fall back to literal text (partial streams)', () => {
  assert.deepEqual(parseInline('Budget **at ris'), [{ type: 'text', value: 'Budget **at ris' }]);
  assert.deepEqual(parseInline('run `npm'), [{ type: 'text', value: 'run `npm' }]);
});

test('arithmetic asterisks are not emphasis', () => {
  assert.deepEqual(parseInline('2 * 3 * 4'), [{ type: 'text', value: '2 * 3 * 4' }]);
});

test('escaped markdown punctuation renders literally', () => {
  assert.deepEqual(parseInline('\\*not italic\\*'), [{ type: 'text', value: '*not italic*' }]);
});

test('safe links are kept, unsafe protocols degrade to text', () => {
  assert.deepEqual(parseInline('[Explorer](https://stellar.expert)'), [
    { type: 'link', href: 'https://stellar.expert', children: [{ type: 'text', value: 'Explorer' }] },
  ]);
  // The `javascript:` target is dropped; only inert label text survives.
  assert.deepEqual(parseInline('[click](javascript:alert(1))'), [{ type: 'text', value: 'click)' }]);
  assert.deepEqual(parseInline('[label](ftp://host/file)'), [{ type: 'text', value: 'label' }]);
  assert.equal(isSafeHref('https://example.com'), true);
  assert.equal(isSafeHref('mailto:ops@example.com'), true);
  assert.equal(isSafeHref('javascript:alert(1)'), false);
  assert.equal(isSafeHref('data:text/html,<b>x</b>'), false);
});

test('raw HTML is preserved as inert text, never markup', () => {
  const blocks = parseMarkdown('<img src=x onerror=alert(1)>');
  assert.deepEqual(blocks, [
    { type: 'paragraph', children: [{ type: 'text', value: '<img src=x onerror=alert(1)>' }] },
  ]);
});

test('unordered and ordered lists are grouped into list blocks', () => {
  const blocks = parseMarkdown('Summary:\n- Treasury healthy\n- **2** alerts\n\n1. Pause agent\n2. Review policy');
  assert.equal(blocks.length, 3);
  assert.deepEqual(blocks[0], { type: 'paragraph', children: [{ type: 'text', value: 'Summary:' }] });
  assert.deepEqual(blocks[1], {
    type: 'list',
    ordered: false,
    start: 1,
    items: [
      [{ type: 'text', value: 'Treasury healthy' }],
      [{ type: 'strong', children: [{ type: 'text', value: '2' }] }, { type: 'text', value: ' alerts' }],
    ],
  });
  assert.equal(blocks[2]?.type, 'list');
  assert.equal(blocks[2]?.type === 'list' && blocks[2].ordered, true);
  assert.equal(blocks[2]?.type === 'list' && blocks[2].items.length, 2);
});

test('ordered lists keep their starting number', () => {
  const [list] = parseMarkdown('3. third\n4. fourth');
  assert.equal(list?.type === 'list' && list.start, 3);
});

test('indented lines continue the previous list item', () => {
  const [list] = parseMarkdown('- first line\n  wraps here\n- second');
  assert.deepEqual(list?.type === 'list' && list.items[0], [{ type: 'text', value: 'first line wraps here' }]);
});

test('headings and fenced code blocks are recognised', () => {
  const blocks = parseMarkdown('## Daily briefing\n```json\n{"spend": 10}\n```');
  assert.deepEqual(blocks, [
    { type: 'heading', level: 2, children: [{ type: 'text', value: 'Daily briefing' }] },
    { type: 'code', language: 'json', value: '{"spend": 10}' },
  ]);
});

test('an unterminated fence (mid-stream) still renders as code', () => {
  const blocks = parseMarkdown('```\nconst a = 1;');
  assert.deepEqual(blocks, [{ type: 'code', language: null, value: 'const a = 1;' }]);
});

test('single newlines inside a paragraph are preserved and CRLF is normalised', () => {
  assert.deepEqual(parseMarkdown('line one\r\nline two'), [
    { type: 'paragraph', children: [{ type: 'text', value: 'line one\nline two' }] },
  ]);
});

test('empty input yields no blocks', () => {
  assert.deepEqual(parseMarkdown(''), []);
  assert.deepEqual(parseMarkdown('\n\n  \n'), []);
});
