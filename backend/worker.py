import argparse
import logging
import time

from .config import Settings
from .db import Database
from .service import Service


def main():
    parser = argparse.ArgumentParser(description='Durable LaunchCloud research worker')
    parser.add_argument('--once', action='store_true', help='Process at most one job and exit')
    args = parser.parse_args()
    settings = Settings.from_env()
    service = Service(Database(settings.database_path), settings)
    while True:
        try:
            did_work = service.run_one()
        except KeyboardInterrupt:
            break
        except Exception:
            logging.exception('Worker failed; unfinished work remains recoverable after its lease expires.')
            did_work = False
        if args.once:
            break
        if not did_work:
            time.sleep(1)


if __name__ == '__main__':
    main()
