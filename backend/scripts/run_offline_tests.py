"""Reproducible synthetic suite: isolated storage, full local KJV corpus, no network."""
import os
from pathlib import Path
import socket
import sys
import tempfile
import threading


def main():
    backend = Path(__file__).resolve().parents[1]
    with tempfile.TemporaryDirectory(prefix="dlbc-repair-tests-") as temporary:
        storage = Path(temporary)
        for name in list(os.environ):
            if name.startswith(('GEMINI_', 'AZURE_', 'GOOGLE_', 'ASSEMBLYAI_', 'DEEPGRAM_')):
                os.environ[name] = ''
        os.environ.update(DATA_ROOT=str(storage), DATABASE_URL='', DATABASE_PATH=str(storage / 'app.db'),
                          APP_ENV='test', GEMINI_API_KEY='', GEMINI_BACKUP_KEY='',
                          PYTHONDONTWRITEBYTECODE='1', PYTHON_DOTENV_DISABLED='1',
                          KJV_CONTEXT_DB_PATH=str(storage / 'kjv.sqlite'))
        sys.dont_write_bytecode = True
        sys.path.insert(0, str(backend))
        sys.path.insert(0, str(backend / 'scripts'))
        # Windows asyncio internally creates a socketpair using loopback; permit only that.
        blocked = []
        local = threading.local()
        original_connect, original_connect_ex, original_pair = socket.socket.connect, socket.socket.connect_ex, socket.socketpair
        def deny(*args, **kwargs):
            blocked.append(True)
            raise RuntimeError('Network disabled during offline synthetic tests')
        def connect(sock, address):
            return original_connect(sock, address) if getattr(local, 'socketpair', False) else deny()
        def connect_ex(sock, address):
            return original_connect_ex(sock, address) if getattr(local, 'socketpair', False) else deny()
        def socketpair(*args, **kwargs):
            local.socketpair = True
            try:
                return original_pair(*args, **kwargs)
            finally:
                local.socketpair = False
        socket.socket.connect, socket.socket.connect_ex, socket.socketpair = connect, connect_ex, socketpair
        socket.create_connection = deny
        from build_kjv_database import build_database
        build_database(output_path=storage / 'kjv.sqlite')
        os.chdir(backend)
        import pytest
        result = pytest.main(sys.argv[1:] or ['tests', '-q', '--tb=short', '-p', 'no:cacheprovider'])
        print(f'OUTBOUND NETWORK ATTEMPTS BLOCKED: {len(blocked)}')
        return result or (1 if blocked else 0)


if __name__ == '__main__':
    raise SystemExit(main())
