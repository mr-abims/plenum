# @plenum/crypto — data-room cryptography

Implements SPEC §10. Session 5 (Oct 11). Shared by `app/` (members) and `agent/` (manager memos).

- Encryption key: HKDF-SHA256(ikm = passkey PRF output, salt = "plenum", info = "plenum/x25519/v1") → X25519.
- Documents: random 256-bit data key, AES-256-GCM.
- Per-reader key wrap: HPKE (RFC 9180) to the reader's X25519 public key.
- PRF output never leaves the client and is never stored.
