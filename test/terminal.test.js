import test from 'node:test';
import assert from 'node:assert/strict';
import { TerminalSession } from '../src/terminal.js';

test('TerminalSession.validateMessageSchema validation rules', () => {
  const session = new TerminalSession(null, null);

  // 1. Valid non-resize messages
  assert.equal(session.validateMessageSchema({ type: 'runFile', code: 'print(1)' }), true);
  assert.equal(session.validateMessageSchema({ type: 'startRepl' }), true);
  assert.equal(session.validateMessageSchema({ type: 'stdin', data: 'hello' }), true);
  assert.equal(session.validateMessageSchema({ type: 'interrupt' }), true);
  assert.equal(session.validateMessageSchema({ type: 'dispose' }), true);

  // 2. Invalid schemas
  assert.equal(session.validateMessageSchema(null), false);
  assert.equal(session.validateMessageSchema({ type: 'invalidType' }), false);
  assert.equal(session.validateMessageSchema({ type: 'runFile' }), false); // missing code
  assert.equal(session.validateMessageSchema({ type: 'runFile', code: 123 }), false); // code not string
  assert.equal(session.validateMessageSchema({ type: 'stdin' }), false); // missing data

  // 3. Valid resize
  assert.equal(session.validateMessageSchema({ type: 'resize', cols: 80, rows: 24 }), true);
  assert.equal(session.validateMessageSchema({ type: 'resize', cols: 20, rows: 5 }), true);
  assert.equal(session.validateMessageSchema({ type: 'resize', cols: 240, rows: 80 }), true);

  // 4. Invalid resize: cols too small/large
  assert.equal(session.validateMessageSchema({ type: 'resize', cols: 19, rows: 24 }), false);
  assert.equal(session.validateMessageSchema({ type: 'resize', cols: 241, rows: 24 }), false);

  // 5. Invalid resize: rows too small/large
  assert.equal(session.validateMessageSchema({ type: 'resize', cols: 80, rows: 4 }), false);
  assert.equal(session.validateMessageSchema({ type: 'resize', cols: 80, rows: 81 }), false);

  // 6. Invalid resize: non-integer values
  assert.equal(session.validateMessageSchema({ type: 'resize', cols: 80.5, rows: 24 }), false);
  assert.equal(session.validateMessageSchema({ type: 'resize', cols: 80, rows: '24' }), false);
});
