import math
import os
import runpy
import sys


def apply_limits():
    try:
        import resource

        timeout_ms = int(os.environ.get("SIMPLEOJ_TERMINAL_TIMEOUT_MS", "60000"))
        cpu_seconds = max(2, math.ceil(timeout_ms / 1000) + 1)
        resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds))
        resource.setrlimit(resource.RLIMIT_AS, (256 * 1024 * 1024, 256 * 1024 * 1024))
        resource.setrlimit(resource.RLIMIT_FSIZE, (2 * 1024 * 1024, 2 * 1024 * 1024))
        if hasattr(resource, "RLIMIT_NPROC"):
            resource.setrlimit(resource.RLIMIT_NPROC, (16, 16))
    except (ImportError, OSError, ValueError):
        # Windows does not expose POSIX rlimits. The Node parent still enforces
        # wall-clock timeout, output limits, a temporary cwd, and process cleanup.
        pass


def main():
    apply_limits()
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except AttributeError:
        pass
    if len(sys.argv) != 2:
        raise SystemExit("Invalid terminal runner invocation")

    import builtins
    import traceback
    
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

    if sys.argv[1] == "--repl":
        import code

        is_running_user_code = True
        try:
            code.interact(
                banner=f"Python {sys.version.split()[0]} on SimpleOJ",
                local={"__name__": "__main__", "__builtins__": __builtins__},
            )
        finally:
            is_running_user_code = False
        return

    if sys.argv[1] == "main.py":
        _original_input = builtins.input

        def wrapped_input(*args, **kwargs):
            prompt = None
            if args:
                prompt = args[0]
            elif "prompt" in kwargs:
                prompt = kwargs["prompt"]

            if prompt is not None:
                sys.stdout.write(str(prompt))
                sys.stdout.flush()
            sys.stderr.write("__SIMPLEOJ_WAITING_INPUT__\n")
            sys.stderr.flush()
            try:
                res = _original_input()
            finally:
                sys.stderr.write("__SIMPLEOJ_RUNNING__\n")
                sys.stderr.flush()
            return res

        builtins.input = wrapped_input
        sys.argv = ["main.py"]
        
        is_running_user_code = True
        try:
            runpy.run_path("main.py", run_name="__main__")
        except BaseException:
            exc_type, exc_value, exc_tb = sys.exc_info()
            tb = exc_tb
            while tb is not None:
                filename = tb.tb_frame.f_code.co_filename
                if filename and filename.endswith("main.py"):
                    break
                tb = tb.tb_next
                
            if tb is not None:
                sys.stderr.write("Traceback (most recent call last):\n")
                tb_lines = traceback.format_exception(exc_type, exc_value, tb)
                if tb_lines and "Traceback" in tb_lines[0]:
                    tb_lines = tb_lines[1:]
                tb_lines = [line for line in tb_lines if "terminal-runner.py" not in line and "runpy.py" not in line]
                sys.stderr.write("".join(tb_lines))
            else:
                tb_lines = traceback.format_exception(exc_type, exc_value, exc_tb)
                tb_lines = [line for line in tb_lines if "terminal-runner.py" not in line and "runpy.py" not in line]
                sys.stderr.write("".join(tb_lines))
            sys.exit(1)
        finally:
            is_running_user_code = False
        return
    raise SystemExit("Only main.py and the Python REPL are allowed")


if __name__ == "__main__":
    main()
