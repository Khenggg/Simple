const PYODIDE_INDEX_URL = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";

importScripts(PYODIDE_INDEX_URL + "pyodide.js");

let pyodide = null;
let sharedBuffer = null;
let interruptBuffer = null;
let statusInt32 = null;
let inputData = null;

// Output limit tracking
let outputBytes = 0;
const MAX_OUTPUT_SIZE = 128 * 1024; // 128KB

function stdout(text) {
  outputBytes += new Blob([text]).size;
  if (outputBytes > MAX_OUTPUT_SIZE) {
    self.postMessage({ type: "output_limit" });
    throw new Error("OUTPUT_LIMIT_EXCEEDED");
  }
  self.postMessage({ type: "stdout", text });
}

function stderr(text) {
  stdout(text);
}

// Custom input handler for Python builtins.input
function customInput(promptText) {
  if (promptText) {
    stdout(promptText);
  }
  
  if (!sharedBuffer || !statusInt32) {
    return "";
  }
  
  // Post WAITING_INPUT to main thread
  self.postMessage({ type: "waiting_input" });
  
  // Reset status to 0 (waiting)
  Atomics.store(statusInt32, 0, 0);
  
  // Wait on statusInt32[0] to change from 0 (waiting_input timeout: 120s)
  const result = Atomics.wait(statusInt32, 0, 0, 120000);
  
  if (result === "timed-out") {
    self.postMessage({ type: "input_timeout" });
    throw new Error("INPUT_TIMEOUT");
  }
  
  const status = Atomics.load(statusInt32, 0);
  if (status === 2) {
    throw new Error("KEYBOARD_INTERRUPT");
  }
  
  // Read length from statusInt32[1]
  const length = Atomics.load(statusInt32, 1);
  
  // Decode string from inputData buffer
  const bytes = new Uint8Array(sharedBuffer, 8, length);
  const nonSharedBytes = new Uint8Array(length);
  nonSharedBytes.set(bytes);
  const decoder = new TextDecoder("utf-8");
  return decoder.decode(nonSharedBytes);
}

async function initPyodide() {
  try {
    pyodide = await loadPyodide({
      indexURL: PYODIDE_INDEX_URL,
      stdout: stdout,
      stderr: stderr
    });
    
    // Set interrupt buffer
    if (interruptBuffer) {
      pyodide.setInterruptBuffer(interruptBuffer);
    }
    
    // Set up builtins.input override in Python
    pyodide.registerJsModule("js_input_module", {
      get_input: customInput
    });
    
    await pyodide.runPythonAsync(`
      import builtins
      import js_input_module
      builtins.input = js_input_module.get_input
    `);
    
    self.postMessage({ type: "ready" });
  } catch (err) {
    self.postMessage({ type: "failed", error: err.message });
  }
}

self.onmessage = async function(e) {
  const msg = e.data;
  
  if (msg.type === "init") {
    sharedBuffer = msg.sharedBuffer;
    interruptBuffer = msg.interruptBuffer;
    if (sharedBuffer) {
      statusInt32 = new Int32Array(sharedBuffer, 0, 2);
      inputData = new Uint8Array(sharedBuffer, 8);
    }
    await initPyodide();
  }
  
  else if (msg.type === "run") {
    if (!pyodide) {
      self.postMessage({ type: "failed", error: "Pyodide not initialized" });
      return;
    }
    
    outputBytes = 0;
    
    if (interruptBuffer) {
      interruptBuffer[0] = 0;
    }
    
    try {
      pyodide.FS.writeFile("main.py", msg.code || "");
      
      await pyodide.runPythonAsync(`
        import runpy
        import sys
        
        # Reset sys.argv and clean up main.py module if it was cached
        sys.argv = ['main.py']
        if 'main' in sys.modules:
            del sys.modules['main']
            
        try:
            runpy.run_path('main.py', run_name='__main__')
        except KeyboardInterrupt:
            pass
        except BaseException as e:
            is_interrupt = 'KEYBOARD_INTERRUPT' in str(e) or 'KEYBOARD_INTERRUPT' in repr(e) or 'KeyboardInterrupt' in type(e).__name__
            if is_interrupt:
                pass
            else:
                import traceback
                tb = traceback.format_exception(type(e), e, e.__traceback__)
                cleaned = []
                for i, line in enumerate(tb):
                    if i == len(tb) - 1:
                        cleaned.append(line)
                    elif 'runpy' in line or 'pyodide' in line or 'js_input_module' in line:
                        continue
                    else:
                        cleaned.append(line)
                sys.stderr.write("".join(cleaned))
                sys.stderr.flush()
      `);
      
      const wasInterrupted = (interruptBuffer && interruptBuffer[0] === 2) || (statusInt32 && Atomics.load(statusInt32, 0) === 2);
      if (wasInterrupted) {
        self.postMessage({ type: "exit", code: 130, interrupted: true });
        return;
      }
      
      self.postMessage({ type: "exit", code: 0 });
    } catch (err) {
      if (err.message === "OUTPUT_LIMIT_EXCEEDED") return;
      if (err.message === "INPUT_TIMEOUT") return;
      if (err.message === "KEYBOARD_INTERRUPT" || err.message.includes("KeyboardInterrupt")) {
        self.postMessage({ type: "exit", code: 130, interrupted: true });
        return;
      }
      self.postMessage({ type: "exit", code: 1, error: err.message });
    }
  }
  
  else if (msg.type === "repl") {
    if (!pyodide) {
      self.postMessage({ type: "failed", error: "Pyodide not initialized" });
      return;
    }
    
    outputBytes = 0;
    if (interruptBuffer) interruptBuffer[0] = 0;
    
    try {
      pyodide.globals.set("__line_code__", msg.code);
      await pyodide.runPythonAsync(`
        import sys
        try:
            # Try to compile as expression
            __code__ = compile(__line_code__, '<stdin>', 'eval')
            __res__ = eval(__code__)
            if __res__ is not None:
                print(repr(__res__))
        except SyntaxError:
            try:
                # Try compile as statement(s)
                __code__ = compile(__line_code__, '<stdin>', 'single')
                exec(__code__)
            except KeyboardInterrupt:
                pass
            except BaseException as e:
                is_interrupt = 'KEYBOARD_INTERRUPT' in str(e) or 'KEYBOARD_INTERRUPT' in repr(e) or 'KeyboardInterrupt' in type(e).__name__
                if is_interrupt:
                    pass
                else:
                    import traceback
                    tb = traceback.format_exception(type(e), e, e.__traceback__)
                    cleaned = []
                    for i, line in enumerate(tb):
                        if i == len(tb) - 1:
                            cleaned.append(line)
                        elif 'pyodide' in line or 'runpy' in line:
                            continue
                        else:
                            cleaned.append(line)
                    sys.stderr.write("".join(cleaned))
                    sys.stderr.flush()
        except KeyboardInterrupt:
            pass
        except BaseException as e:
            is_interrupt = 'KEYBOARD_INTERRUPT' in str(e) or 'KEYBOARD_INTERRUPT' in repr(e) or 'KeyboardInterrupt' in type(e).__name__
            if is_interrupt:
                pass
            else:
                import traceback
                tb = traceback.format_exception(type(e), e, e.__traceback__)
                cleaned = []
                for i, line in enumerate(tb):
                    if i == len(tb) - 1:
                        cleaned.append(line)
                    elif 'pyodide' in line or 'runpy' in line:
                        continue
                    else:
                        cleaned.append(line)
                sys.stderr.write("".join(cleaned))
                sys.stderr.flush()
      `);
      
      const wasInterrupted = (interruptBuffer && interruptBuffer[0] === 2) || (statusInt32 && Atomics.load(statusInt32, 0) === 2);
      if (wasInterrupted) {
        self.postMessage({ type: "exit", code: 130, interrupted: true });
        return;
      }
      
      self.postMessage({ type: "exit", code: 0 });
    } catch (err) {
      if (err.message === "OUTPUT_LIMIT_EXCEEDED") return;
      if (err.message === "INPUT_TIMEOUT") return;
      if (err.message === "KEYBOARD_INTERRUPT" || err.message.includes("KeyboardInterrupt")) {
        self.postMessage({ type: "exit", code: 130, interrupted: true });
        return;
      }
      self.postMessage({ type: "exit", code: 1, error: err.message });
    }
  }
};
