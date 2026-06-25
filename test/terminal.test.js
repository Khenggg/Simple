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

test('TerminalSession.handlePipeInput fallback editor simulation', () => {
  const session = new TerminalSession({ readyState: 1, send: () => {} }, null);
  
  let stdinWritten = [];
  let interruptCalled = false;
  let outputs = [];
  
  // Set up mock state
  session.process = {
    stdin: {
      write(data) {
        stdinWritten.push(data);
      }
    }
  };
  session.interrupt = () => {
    interruptCalled = true;
  };
  session.output = (data) => {
    outputs.push(data);
  };
  session.inputBuffer = '';

  // 1. Regular printable characters
  session.handlePipeInput('abc');
  assert.equal(session.inputBuffer, 'abc');
  assert.deepEqual(outputs, ['a', 'b', 'c']);
  outputs = [];

  // 2. Backspace deletes last character
  session.handlePipeInput('\x7f'); // DEL
  assert.equal(session.inputBuffer, 'ab');
  assert.deepEqual(outputs, ['\b \b']);
  outputs = [];

  session.handlePipeInput('\x08'); // BS
  assert.equal(session.inputBuffer, 'a');
  assert.deepEqual(outputs, ['\b \b']);
  outputs = [];

  // 3. Backspace on empty buffer does nothing
  session.inputBuffer = '';
  session.handlePipeInput('\x7f');
  assert.equal(session.inputBuffer, '');
  assert.deepEqual(outputs, []);

  // 4. Enter flushes the buffer to process stdin and outputs CRLF
  session.inputBuffer = 'hello';
  session.handlePipeInput('\r');
  assert.deepEqual(stdinWritten, ['hello\n']);
  assert.equal(session.inputBuffer, '');
  assert.deepEqual(outputs, ['\r\n']);
  stdinWritten = [];
  outputs = [];

  // 5. Ctrl+C calls interrupt
  session.handlePipeInput('\x03');
  assert.equal(interruptCalled, true);

  // 6. Repeated chars input
  session.inputBuffer = '';
  session.handlePipeInput('iiii');
  assert.equal(session.inputBuffer, 'iiii');
  assert.deepEqual(outputs, ['i', 'i', 'i', 'i']);
});
