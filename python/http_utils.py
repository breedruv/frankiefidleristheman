import time

import requests


DEFAULT_TIMEOUT_SECONDS = 20
DEFAULT_RETRIES = 3
DEFAULT_BACKOFF_SECONDS = 1


def get_session():
    session = requests.Session()
    session.headers.update({"User-Agent": "cbb-data-collector/1.0"})
    return session


def fetch_json(url, session=None, timeout=DEFAULT_TIMEOUT_SECONDS, retries=DEFAULT_RETRIES):
    last_error = None
    for attempt in range(1, retries + 1):
        try:
            client = session or requests
            response = client.get(url, timeout=timeout)
            response.raise_for_status()
            return response.json()
        except Exception as error:
            last_error = error
            if attempt == retries:
                raise
            time.sleep(DEFAULT_BACKOFF_SECONDS * attempt)
    raise last_error


def fetch_content(url, session=None, timeout=DEFAULT_TIMEOUT_SECONDS, retries=DEFAULT_RETRIES):
    last_error = None
    for attempt in range(1, retries + 1):
        try:
            client = session or requests
            response = client.get(url, timeout=timeout)
            response.raise_for_status()
            return response.content
        except Exception as error:
            last_error = error
            if attempt == retries:
                raise
            time.sleep(DEFAULT_BACKOFF_SECONDS * attempt)
    raise last_error
