"""Install and supervise the local API, durable worker, and frontend together."""

import argparse
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time
from urllib.error import URLError
from urllib.request import urlopen
import webbrowser


ROOT = Path(__file__).resolve().parent
FRONTEND = ROOT / 'frontend'
PYTHON = ROOT / '.venv' / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
LOGS = ROOT / '.local' / 'logs'
CHILD_FLAGS = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0


def install(force):
    if sys.version_info < (3, 12):
        raise RuntimeError('Python 3.12 or newer is required.')
    node = shutil.which('node')
    npm = shutil.which('npm.cmd' if os.name == 'nt' else 'npm')
    if not node or not npm:
        raise RuntimeError('Install Node.js 22.12 or newer, then restart this terminal.')
    version = subprocess.check_output([node, '--version'], text=True).strip().lstrip('v')
    if tuple(map(int, version.split('.')[:2])) < (22, 12):
        raise RuntimeError(f'Node.js {version} is too old; version 22.12 or newer is required.')
    if not PYTHON.exists():
        subprocess.run([sys.executable, '-m', 'venv', str(ROOT / '.venv')], check=True)
    dependencies = subprocess.run(
        [str(PYTHON), '-c', 'import fastapi, uvicorn, pydantic, httpx'],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    if force or dependencies.returncode:
        subprocess.run([str(PYTHON), '-m', 'pip', 'install', '-r', str(ROOT / 'backend/requirements.txt')], check=True)
    vite = FRONTEND / 'node_modules/vite/bin/vite.js'
    if force or not vite.exists():
        subprocess.run([npm, 'ci', '--no-audit', '--no-fund'], cwd=FRONTEND, check=True)
    return node, vite


def check_ports(ports):
    for port in ports:
        with socket.socket() as probe:
            try:
                probe.bind(('127.0.0.1', port))
            except OSError as error:
                raise RuntimeError(f'Port {port} is already in use. Stop that server before starting LaunchCloud.') from error


def check_children(children):
    for name, process in children:
        code = process.poll()
        if code is not None:
            raise RuntimeError(f'{name} exited with code {code}. See {LOGS / (name + ".log")}.')


def wait_for(url, children):
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        check_children(children)
        try:
            with urlopen(url, timeout=1) as response:
                return response.read()
        except (URLError, TimeoutError, OSError):
            time.sleep(0.25)
    raise RuntimeError(f'Timed out waiting for {url}. See logs in {LOGS}.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--install', action='store_true', help='Reinstall dependencies using the pinned requirements and npm lockfile.')
    parser.add_argument('--no-browser', action='store_true', help='Start services without opening a browser.')
    parser.add_argument('--api-port', type=int, default=8000, help='API port (default: 8000); use 8001 for an isolated second backend.')
    parser.add_argument('--reuse-api', action='store_true', help='Connect to an existing LaunchCloud API and worker; start only the frontend.')
    args = parser.parse_args()
    from backend.environment import load_local_env
    load_local_env()
    children, streams = [], []
    try:
        node, vite = install(args.install)
        if not 1 <= args.api_port <= 65535 or args.api_port == 5173:
            raise RuntimeError('Choose an API port between 1 and 65535 other than frontend port 5173.')
        check_ports((5173,) if args.reuse_api else (args.api_port, 5173))
        api_url = f'http://127.0.0.1:{args.api_port}'
        if args.reuse_api:
            with urlopen(api_url + '/api/health', timeout=5) as response:
                existing = json.load(response)
            if existing.get('status') != 'ok' or 'research_mode' not in existing or not existing.get('worker_required'):
                raise RuntimeError(f'{api_url} is not a healthy LaunchCloud API.')
        environment = os.environ.copy()
        environment.setdefault('DATABASE_PATH', str(ROOT / 'backend/data/launchcloud.sqlite3'))
        environment.setdefault('DEMO_MODE', 'true')
        environment.setdefault('OPERATOR_TOKEN', 'demo-operator')
        # The launcher always connects the real frontend client to the local API.
        # Frontend-only fixtures remain available through npm run dev:mock.
        environment['VITE_API_BASE_URL'] = api_url
        environment['VITE_USE_MOCK_API'] = 'false'
        LOGS.mkdir(parents=True, exist_ok=True)
        commands = [
            ('api', [str(PYTHON), '-m', 'uvicorn', 'backend.main:create_app', '--factory', '--host', '127.0.0.1', '--port', str(args.api_port)], ROOT),
            ('worker', [str(PYTHON), '-m', 'backend.worker'], ROOT),
            ('frontend', [node, str(vite), '--host', '127.0.0.1'], FRONTEND),
        ]
        if args.reuse_api:
            commands = [commands[-1]]
        for name, command, directory in commands:
            stream = (LOGS / f'{name}.log').open('w', encoding='utf-8')
            streams.append(stream)
            process = subprocess.Popen(command, cwd=directory, env=environment, stdout=stream, stderr=subprocess.STDOUT, creationflags=CHILD_FLAGS)
            children.append((name, process))
        health = json.loads(wait_for(api_url + '/api/health', children))
        wait_for('http://127.0.0.1:5173', children)
        print('LaunchCloud is running at http://127.0.0.1:5173', flush=True)
        print(f'API documentation: {api_url}/docs', flush=True)
        print(f'Research: {health["research_mode"]}. Logs: {LOGS}', flush=True)
        print('Using the existing API and worker; they remain running.' if args.reuse_api else 'API, worker, and frontend are managed together.', flush=True)
        print('Press Ctrl+C to stop the services started by this launcher.', flush=True)
        if not args.no_browser:
            webbrowser.open('http://127.0.0.1:5173')
        while True:
            check_children(children)
            time.sleep(0.5)
    except KeyboardInterrupt:
        print('\nStopping LaunchCloud...', flush=True)
    except (OSError, RuntimeError, ValueError, subprocess.CalledProcessError) as error:
        print(f'LaunchCloud could not start: {error}', file=sys.stderr, flush=True)
        return 1
    finally:
        for _, process in reversed(children):
            if process.poll() is None:
                process.terminate()
        for _, process in reversed(children):
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        for stream in streams:
            stream.close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
