import pathlib

for path in pathlib.Path('.').rglob('*.vue'):
    try:
        path.read_text(encoding='utf-8')
    except UnicodeDecodeError as exc:
        print('decode error', path, exc)
