import assert from 'node:assert/strict';
import test from 'node:test';
import { createFocusTrapStack } from './focusTrapStack';

test('the most recently opened trap is the only top-most layer', () => {
  const stack = createFocusTrapStack();
  const drawer = stack.push();
  const dialog = stack.push();

  assert.equal(stack.isTop(dialog), true);
  assert.equal(stack.isTop(drawer), false);
});

test('releasing the inner trap hands keyboard control back to the outer one', () => {
  const stack = createFocusTrapStack();
  const drawer = stack.push();
  const dialog = stack.push();

  stack.release(dialog);

  assert.equal(stack.isTop(drawer), true);
  assert.equal(stack.size(), 1);
});

test('traps released out of order leave the remaining order intact', () => {
  const stack = createFocusTrapStack();
  const a = stack.push();
  const b = stack.push();
  const c = stack.push();

  stack.release(b);

  assert.equal(stack.isTop(c), true);
  stack.release(c);
  assert.equal(stack.isTop(a), true);
});

test('releasing an unknown or already released token is a no-op', () => {
  const stack = createFocusTrapStack();
  const a = stack.push();

  stack.release(Symbol('stranger'));
  stack.release(a);
  stack.release(a);

  assert.equal(stack.size(), 0);
  assert.equal(stack.isTop(a), false);
});
