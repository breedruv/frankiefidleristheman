import csv
from pathlib import Path


def ensure_csv_header(path, header, encoding="utf-8"):
    csv_path = Path(path)
    if csv_path.exists() and csv_path.stat().st_size > 0:
        return False
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    with csv_path.open("w", newline="", encoding=encoding) as file:
        writer = csv.writer(file)
        writer.writerow(header)
    return True


def load_existing_keys(path, key_indices, expected_header=None, encoding="utf-8"):
    csv_path = Path(path)
    keys = set()
    if not csv_path.exists() or csv_path.stat().st_size == 0:
        return keys

    max_index = max(key_indices)
    with csv_path.open("r", newline="", encoding=encoding) as file:
        reader = csv.reader(file)
        first_row = True
        for row in reader:
            if first_row and expected_header and row == expected_header:
                first_row = False
                continue
            first_row = False
            if len(row) <= max_index:
                continue
            keys.add(tuple(row[i] for i in key_indices))
    return keys
