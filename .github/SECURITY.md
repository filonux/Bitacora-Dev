# Security Policy

Bitácora Dev runs entirely in your browser: it is a single HTML file with no backend, and your projects live in the browser's local storage. If you find a real security problem, please report it privately rather than opening a public issue. Reporting it publicly is also fine; the choice is yours.

## Supported versions

Only the latest release is supported. The version number is shown in Settings and in `BitacoraAPI.version`.

## What to report

Anything that could expose stored data or API keys, run unexpected code (for example through an imported file, a note or a project name), or send data to a third party that the user did not configure.

## Keys and passwords

- The backup, the assistant memory export and the TXT, DOCX and PDF exports never contain API keys. If one ever does, that is a vulnerability worth reporting.
- **Export APIs** (and `BitacoraAPI.exportApis`) does include them, on purpose: it is the only file that does. It is plain text unless *Encrypt the file with a password* is on; then it is encrypted in the browser (PBKDF2-SHA256, 600,000 iterations, AES-256-GCM) and nothing is written in the clear. Treat that file like a password.
- With *Encrypt the backup with a password* on, that password is kept in this browser's local storage as plain text, so later backups do not ask for it again. Anyone who can read the browser profile can read it. It is left out of backups and exports, and a password typed into the assistant chat is masked.
- API keys also sit in local storage as plain text, like the rest of your data.

## How to report it

Write to **filonux@proton.me** with a description of the problem, the app version, your browser, and the steps to reproduce it if you can. The project is maintained in spare time, so replies may take a while.
