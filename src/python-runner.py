import contextlib
import io
import json
import os
import sys
import traceback


def apply_limits(payload):
    try:
        import resource
        memory = 192 * 1024 * 1024
        resource.setrlimit(resource.RLIMIT_AS, (memory, memory))
        resource.setrlimit(resource.RLIMIT_FSIZE, (1024 * 1024, 1024 * 1024))
        resource.setrlimit(resource.RLIMIT_NOFILE, (32, 32))
        if hasattr(resource, "RLIMIT_NPROC"):
            resource.setrlimit(resource.RLIMIT_NPROC, (8, 8))
        seconds = max(1, int(payload.get("limitMs", 1500) / 1000) + 1)
        resource.setrlimit(resource.RLIMIT_CPU, (seconds, seconds + 1))
    except (ImportError, ValueError, OSError):
        pass


def main():
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except AttributeError:
        pass
    payload = json.loads(sys.stdin.read())
    apply_limits(payload)
    
    import builtins
    _original_import = builtins.__import__
    BLOCKED_MODULES = {"os", "subprocess", "socket", "multiprocessing", "threading"}
    
    global is_running_user_code
    is_running_user_code = False

    def restricted_import(name, globals=None, locals=None, fromlist=(), level=0):
        # Check call stack to see if import is initiated by user code
        is_user_import = False
        caller_frame = sys._getframe(1)
        while caller_frame:
            filename = caller_frame.f_code.co_filename
            if filename and (filename.endswith("main.py") or filename.endswith("submission.py") or filename == "<stdin>" or filename == "<string>"):
                is_user_import = True
                break
            caller_frame = caller_frame.f_back

        if is_user_import:
            top_level_name = name.split('.')[0]
            if top_level_name in BLOCKED_MODULES:
                raise ImportError(f"[Blocked import: {top_level_name}]\nModule này không được phép trong môi trường SimpleOJ.")
        return _original_import(name, globals, locals, fromlist, level)

    builtins.__import__ = restricted_import

    output = io.StringIO()
    error = None
    old_stdin, old_stdout, old_stderr = sys.stdin, sys.stdout, sys.stderr
    sys.stdin = io.StringIO(str(payload.get("input", "")))
    sys.stdout = output
    sys.stderr = output
    
    is_running_user_code = True
    try:
        namespace = {"__name__": "__main__", "__builtins__": __builtins__}
        exec(compile(str(payload.get("code", "")), "submission.py", "exec"), namespace, namespace)
    except BaseException:
        exc_type, exc_value, exc_tb = sys.exc_info()
        tb = exc_tb
        while tb is not None:
            filename = tb.tb_frame.f_code.co_filename
            if filename and filename.endswith("submission.py"):
                break
            tb = tb.tb_next
            
        if tb is not None:
            tb_lines = traceback.format_exception(exc_type, exc_value, tb)
            if tb_lines and "Traceback" in tb_lines[0]:
                tb_lines = tb_lines[1:]
            tb_lines = [line for line in tb_lines if "python-runner.py" not in line]
            error = "Traceback (most recent call last):\n" + "".join(tb_lines)
        else:
            tb_lines = traceback.format_exception(exc_type, exc_value, exc_tb)
            tb_lines = [line for line in tb_lines if "python-runner.py" not in line]
            error = "".join(tb_lines)
    finally:
        is_running_user_code = False
        sys.stdin, sys.stdout, sys.stderr = old_stdin, old_stdout, old_stderr
    text = output.getvalue()
    result = {"output": text[:20000], "error": error, "truncated": len(text) > 20000}
    sys.stdout.buffer.write(json.dumps(result, ensure_ascii=False).encode('utf-8'))
    sys.stdout.buffer.write(b'\n')


if __name__ == "__main__":
    main()
