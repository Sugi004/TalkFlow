from pathlib import Path
import mimetypes


ALLOWED_EXTENSIONS = {
    "jpg", "jpeg", "png", "webp", "gif", "bmp", "svg", "ico", "avif",
    "mp4", "mov", "webm", "m4v", "avi", "mkv",
    "pdf", "txt", "md", "csv", "tsv", "log", "json", "xml", "yaml", "yml",
    "toml", "ini", "cfg", "conf", "env", "zip", "tar", "gz", "tgz", "bz2",
    "xz", "7z", "rar",
    "js", "mjs", "cjs", "jsx", "ts", "tsx", "py", "pyi", "java", "kt", "kts",
    "swift", "go", "rs", "rb", "php", "c", "h", "cc", "hh", "cpp", "cxx",
    "hpp", "cs", "scala", "sql", "sh", "bash", "zsh", "fish", "ps1", "bat",
    "cmd", "html", "css", "scss", "sass", "less", "vue", "svelte", "astro",
    "graphql", "gql", "prisma", "gradle", "properties", "lock", "ipynb", "r",
    "lua", "dart", "elm", "erl", "ex", "exs", "gitignore", "dockerignore",
    "npmrc", "editorconfig", "prettierrc", "eslintrc", "babelrc",
}

ALLOWED_SPECIAL_FILENAMES = {
    "dockerfile",
    "makefile",
    "procfile",
    "gemfile",
    "rakefile",
    "vagrantfile",
    "jenkinsfile",
}

ALLOWED_CONTENT_PREFIXES = ("text/", "image/", "video/")
ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "application/json",
    "application/xml",
    "application/javascript",
    "application/typescript",
    "application/sql",
    "application/graphql-response+json",
    "application/zip",
    "application/x-zip-compressed",
    "application/x-tar",
    "application/gzip",
    "application/x-gzip",
    "application/x-7z-compressed",
    "application/vnd.rar",
    "application/x-rar-compressed",
}

TEXT_LIKE_EXTENSIONS = {
    "txt", "md", "csv", "tsv", "log", "json", "xml", "yaml", "yml", "toml",
    "ini", "cfg", "conf", "env", "js", "mjs", "cjs", "jsx", "ts", "tsx", "py",
    "pyi", "java", "kt", "kts", "swift", "go", "rs", "rb", "php", "c", "h",
    "cc", "hh", "cpp", "cxx", "hpp", "cs", "scala", "sql", "sh", "bash",
    "zsh", "fish", "ps1", "bat", "cmd", "html", "css", "scss", "sass", "less",
    "vue", "svelte", "astro", "graphql", "gql", "prisma", "gradle",
    "properties", "lock", "r", "lua", "dart", "elm", "erl", "ex", "exs",
    "gitignore", "dockerignore", "npmrc", "editorconfig", "prettierrc",
    "eslintrc", "babelrc",
}

EXTENSION_CONTENT_TYPE_OVERRIDES = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
    "gif": "image/gif",
    "svg": "image/svg+xml",
    "avif": "image/avif",
    "bmp": "image/bmp",
    "ico": "image/x-icon",
    "mp4": "video/mp4",
    "mov": "video/quicktime",
    "webm": "video/webm",
    "m4v": "video/x-m4v",
    "avi": "video/x-msvideo",
    "mkv": "video/x-matroska",
    "pdf": "application/pdf",
    "zip": "application/zip",
    "tar": "application/x-tar",
    "gz": "application/gzip",
    "tgz": "application/gzip",
    "bz2": "application/x-bzip2",
    "xz": "application/x-xz",
    "7z": "application/x-7z-compressed",
    "rar": "application/vnd.rar",
    "json": "application/json",
    "xml": "application/xml",
    "md": "text/markdown",
    "csv": "text/csv",
    "tsv": "text/tab-separated-values",
    "html": "text/html",
    "css": "text/css",
    "js": "text/javascript",
    "mjs": "text/javascript",
    "cjs": "text/javascript",
    "jsx": "text/plain",
    "ts": "text/plain",
    "tsx": "text/plain",
    "py": "text/x-python",
    "pyi": "text/plain",
    "java": "text/x-java-source",
    "kt": "text/plain",
    "kts": "text/plain",
    "swift": "text/plain",
    "go": "text/plain",
    "rs": "text/plain",
    "rb": "text/plain",
    "php": "application/x-httpd-php",
    "c": "text/x-c",
    "h": "text/x-c",
    "cc": "text/x-c++src",
    "hh": "text/x-c++hdr",
    "cpp": "text/x-c++src",
    "cxx": "text/x-c++src",
    "hpp": "text/x-c++hdr",
    "cs": "text/plain",
    "scala": "text/plain",
    "sql": "application/sql",
    "sh": "text/x-shellscript",
    "bash": "text/x-shellscript",
    "zsh": "text/x-shellscript",
    "fish": "text/plain",
    "ps1": "text/plain",
    "bat": "text/plain",
    "cmd": "text/plain",
    "vue": "text/plain",
    "svelte": "text/plain",
    "astro": "text/plain",
    "graphql": "application/graphql",
    "gql": "application/graphql",
    "prisma": "text/plain",
    "gradle": "text/plain",
    "properties": "text/plain",
    "env": "text/plain",
}


def sanitize_file_name(file_name: str) -> str:
    cleaned = Path(file_name or "upload").name.strip()
    return cleaned or "upload"


def get_extension(file_name: str) -> str:
    cleaned = sanitize_file_name(file_name)
    suffix = Path(cleaned).suffix.lower().lstrip(".")
    if suffix:
        return suffix
    lowered = cleaned.lower()
    if lowered.startswith(".") and len(lowered) > 1:
        return lowered[1:]
    return ""


def normalize_content_type(file_name: str, content_type: str) -> str:
    normalized = (content_type or "").split(";", 1)[0].strip().lower()
    if normalized:
        return normalized

    extension = get_extension(file_name)
    if extension in EXTENSION_CONTENT_TYPE_OVERRIDES:
        return EXTENSION_CONTENT_TYPE_OVERRIDES[extension]

    guessed, _ = mimetypes.guess_type(sanitize_file_name(file_name))
    if guessed:
        return guessed.lower()

    lowered = sanitize_file_name(file_name).lower()
    if extension in TEXT_LIKE_EXTENSIONS or lowered in ALLOWED_SPECIAL_FILENAMES:
        return "text/plain"

    return "application/octet-stream"


def is_allowed_upload(file_name: str, content_type: str) -> bool:
    cleaned = sanitize_file_name(file_name)
    extension = get_extension(cleaned)
    normalized = normalize_content_type(cleaned, content_type)
    allowed_name = extension in ALLOWED_EXTENSIONS or cleaned.lower() in ALLOWED_SPECIAL_FILENAMES
    allowed_content_type = normalized.startswith(ALLOWED_CONTENT_PREFIXES) or normalized in ALLOWED_CONTENT_TYPES
    return allowed_name or allowed_content_type
