# Frontend Specification and Cryptographic Rigor

This document defines the requirements and rigor for any frontend implementation of the Omnis secure messaging app, and prescribes the cryptographic primitives and standard APIs to use in other languages (Java, C/C++, Rust, Python) when re‑implementing the protocol.

---

## 1. Frontend Architecture & Responsibilities

The frontend is a thin client responsible for:

- **User interaction**
  - Signup, login, logout
  - Listing chats and creating new chats
  - Sending and receiving messages in real time (WebSocket-first, REST fallback)
  - Account/session management UI (view/revoke sessions)
- **Local cryptography** (end‑to‑end encryption)
  - Generating and managing long‑term identity key pairs (ECDH P‑384)
  - Deriving symmetric keys from user passwords for local key encryption (PBKDF2 + AES‑GCM)
  - Generating per‑chat epoch keys (AES‑GCM 256‑bit)
  - Wrapping/unwrapping epoch keys for each peer (ECDH + HKDF + AES‑GCM)
  - Encrypting and decrypting message payloads using epoch keys (AES‑GCM)
- **Networking**
  - Talking to the backend over HTTPS (REST) and WSS/WS (chat stream)
  - Including device identifier (`X-Device-ID`) and bearer token for authenticated calls
  - Authenticating chat WebSocket connections with a first-frame auth payload
  - Registering and managing device push tokens for background wake delivery (mobile)

The server **never sees plaintext messages or identity private keys**. It only stores encrypted key material and ciphertext.

---

## 2. Security & Rigor Requirements

### 2.1 Identity Keys & Passwords

- Identity key pair:
  - Type: **ECDH**, curve **P‑384**.
  - The **private key must never leave the device unencrypted**.
- Password handling:
  - Passwords are **never cached in storage**; they are used only to derive a key and then discarded from memory as soon as possible.
  - Derivation: PBKDF2 with **SHA‑256**, **100 000 iterations**, and a **32‑byte random salt**.
- Encrypted key blob:
  - Structure (conceptual):
    - `identity_pub`: base64‑encoded SPKI public key.
    - `encrypted_identity_priv`: base64 ciphertext of PKCS#8 private key, encrypted under an AES‑GCM key derived from the password.
    - `kdf_salt`: base64 salt used for PBKDF2.
    - `aead_nonce`: base64 12‑byte AES‑GCM nonce.

### 2.2 Epoch Keys and Message Encryption

- Epoch key:
  - Type: **AES‑GCM**, 256‑bit key.
  - Generated randomly on the client.
- Epoch key wrapping:
  - Shared secret via **ECDH (P‑384)** between identity keys.
  - HKDF‑SHA‑256 to derive a symmetric wrapping key from the ECDH shared secret with context `info = "epoch-key-wrap"` and a fixed 32‑byte salt (all zeros acceptable, but must be **identical** across implementations).
  - AES‑GCM used to encrypt the raw epoch key.
  - The stored wrapped key format is **nonce || ciphertext**, base64‑encoded.
- Message encryption:
  - Plaintext: UTF‑8 string.
  - AES‑GCM with **12‑byte random nonce** and the current epoch key.
  - Ciphertext and nonce are base64‑encoded and sent in the payload.

### 2.3 Local Storage & State

- **Allowed in persistent storage**:
  - Auth token (`authToken`)
  - Device identifier (`deviceId`)
  - Current user identifiers (`currentUserId`, `currentUsername`)
  - Non‑sensitive UI state
- **Not allowed in persistent storage**:
  - Raw passwords
  - Raw or decrypted identity private keys
  - Raw epoch keys

### 2.4 XSS & Content Handling

- All message bodies must be displayed as **escaped HTML** (no raw HTML rendering from user content).
- No inline event handlers are allowed in templates; use DOM APIs and `addEventListener`.
- Avoid third‑party scripts unless strictly required; if added, use Subresource Integrity (SRI) and CSP where possible.

### 2.5 Session & Device Management

- Each client instance must maintain a **stable `deviceId`** (UUID) in local storage.
- Every authenticated request must send:
  - `Authorization: Bearer <token>`
  - `X-Device-ID: <deviceId>`
- The account UI must:
  - List sessions from `/users/sessions`.
  - Allow revoking individual sessions and all other sessions.

---

## 3. Frontend Behavioural Spec

### 3.1 Signup Flow

1. User submits `username` and `password`.
2. Frontend **generates identity key pair** (ECDH P‑384).
3. Frontend **exports `identity_pub`** (SPKI, base64).
4. Frontend **exports `identity_priv`** (PKCS#8, base64) and **encrypts** it:
   - Derive password key via PBKDF2 (SHA‑256, 100 000 iterations, 32‑byte random salt).
   - Encrypt base64 private key using AES‑GCM with a 12‑byte random nonce.
5. Frontend posts `/auth/signup` with:
   - `username`, `password`, `identity_pub`, `encrypted_identity_priv`, `kdf_salt`, `aead_nonce`.
6. On success, frontend **does not** cache the password; it may direct the user to login.

### 3.2 Login & Unlock Flow

1. User submits `username` and `password`.
2. Frontend calls `/auth/login` with `username`, `password`, and `X-Device-ID`.
3. On success, it stores the returned `token` and the `currentUsername` and `currentUserId` (from `/auth/me`).
4. Frontend fetches `/auth/keyblob`.
5. Frontend **decrypts the identity private key** using the password and stored salt/nonce.
6. If decryption fails, the login is not considered complete and a relevant error is displayed.

### 3.3 User Search & Chat Creation

- To start a new chat, the frontend should use `GET /users/search?q=<partial>` to
  find users by partial username match.
- The endpoint returns up to 7 results ranked by relevance (exact → prefix →
  substring, shorter names first). The current user is excluded.
- The user selects a result and the frontend calls `POST /chat/create` with the
  chosen username.

### 3.4 Chat & Epoch Handling

- When a chat is opened, the frontend should open `WebSocket /chat/ws/{chat_id}` and
  authenticate immediately using the first frame:
  - `{"type":"auth","token":"<session_token>","device_id":"<uuid-v4>"}`.
  - On successful auth, the server sends a `history` frame with recent messages.
  - New messages are then delivered via `new_message` frames.
  - The client should send heartbeat pings (`{"type":"ping"}`), handle `pong`,
    and reconnect automatically on recoverable disconnects.
- When message history is fetched via REST (`/chat/fetch/{chat_id}`), or received via
  WebSocket (`history` / `new_message`), the frontend:
  - Receives `messages[]` containing message data with `epoch_id` references.
  - For each message, check if the epoch key for `epoch_id` is already cached locally.
  - For any epoch whose wrapped key is not yet cached:
    - Fetch the wrapped key via `GET /chat/{chat_id}/{epoch_id}/fetch`.
    - Unwraps the epoch key using ECDH + HKDF + AES‑GCM.
    - Caches epoch keys in a per‑chat map.
  - **Optimization**: Batch epoch fetches by collecting all unique `epoch_id` values
    from messages that are not yet cached, then fetch them in parallel or sequentially
    before decrypting messages.
- When sending a message:
  - Ensure a **current epoch** exists (create via `/chat/{chat_id}/epoch` if allowed by server policy—rate limits and message counts must be respected).
  - Use the latest epoch key to AES‑GCM encrypt the UTF‑8 message body.
  - Post ciphertext, nonce, and epoch id via `/chat/{chat_id}/message`.
  - If the send fails due to stale or unknown epoch, refresh epoch state and retry once.

### 3.5 Media Attachments

Media files (images, GIFs, audio, video, and arbitrary large files) are handled
separately from text messages to avoid blocking the chat pipeline with large
uploads. The workflow is:

#### Upload flow

1. The client **encrypts** the file locally using AES‑GCM with a **12‑byte
   random nonce** and the current epoch key (same key used for message bodies).
2. The encrypted blob is split into chunk envelopes where
  `encrypted_chunk_bytes + chunk_metadata_bytes <= 256 MiB`.
   - The client generates a unique `upload_id` (UUID v4) to group all chunks.
3. Each chunk is uploaded individually via `POST /media/upload` as a streamed
  multipart request:
   `multipart/form-data`, including:
   - `file` — the encrypted binary chunk
   - `chat_id` — the chat this media belongs to
   - `mime_type` — the original MIME type (e.g. `image/png`, `video/mp4`)
   - `nonce` — the base64 encryption nonce (same for all chunks of one file)
   - `chunk_index` — 0-based chunk number
   - `total_chunks` — total number of chunks
   - `upload_id` — the UUID grouping chunks together
4. The server responds with a `media_id` for each successfully uploaded chunk,
   plus a `complete` flag indicating whether all chunks have arrived.
5. Uploads can be retried individually per chunk without re-uploading the
   entire file.

#### Attaching media to a message

1. After all chunks are uploaded (the server confirms `complete: true`), the
   client sends a message via `POST /chat/{chat_id}/message` with the
   `media_ids` field containing one `media_id` per attached file (any chunk id
   from the upload suffices; the server resolves all chunks via `upload_id`).
2. A single message may reference **multiple** media uploads (e.g. several
   images attached to one message).

#### Receiving and downloading attachments

1. When a message arrives (via WebSocket `new_message` frame, REST
   `/chat/fetch/{chat_id}`, or WebSocket `history`), the `attachments` array
   is included in the message payload.
2. Each attachment object contains:
   - `upload_id` — unique identifier for the upload
   - `mime_type` — original MIME type
   - `nonce` — encryption nonce
   - `total_chunks` and `total_size` — for progress display
   - `chunks[]` — array of `{ media_id, chunk_index, file_size }`
3. The client downloads each chunk via streaming
  `GET /media/download/{media_id}` responses.
4. After downloading all chunks, the client **reassembles** them in
   `chunk_index` order and **decrypts** the concatenated blob using the epoch
   key and the provided nonce.
5. Metadata for an upload can also be fetched separately via
   `GET /media/{media_id}/meta`.

#### Encryption requirements

- Media **MUST** be encrypted client‑side before upload using the **current
  epoch key** and AES‑GCM.
- The encryption nonce **MUST** be unique per file upload.
- The server stores only the encrypted blob and never decrypts media.
- The nonce is stored in the media metadata and included in attachment payloads
  so the receiving client can decrypt.

#### Size limits

- Each upload envelope **MUST NOT** exceed **256 MiB** (`268435456` bytes),
  where envelope size is encrypted chunk bytes plus multipart metadata.
  The server rejects oversized uploads with HTTP `413`.
- There is no server-enforced limit on total file size, but clients should
  display appropriate progress UI for multi-chunk uploads and downloads.

#### Pipeline summary (normative)

Media pipeline:

1. Media file -> chunk.
2. Chunk + chunk metadata (envelope) limited to 256 MiB total.
3. Encrypt chunk payload client-side.
4. Stream upload each encrypted chunk envelope via `POST /media/upload`.
5. Attach returned `media_id` references in `POST /chat/{chat_id}/message`.

Download pipeline:

1. Read message `attachments[]`.
2. Stream-download each chunk from `GET /media/download/{media_id}`.
3. Reassemble by `chunk_index`.
4. Decrypt reassembled blob using attachment `nonce`.

### 3.6 Notification System (WebSocket + FCM Wake)

The notification model is **delivery-first via WebSocket**, with **Android FCM push**
as an offline wake mechanism.

#### A. Foreground / active-chat flow

1. User opens a chat.
2. Client opens `WebSocket /chat/ws/{chat_id}` and sends first-frame auth
  (`type=auth`, session token, device id).
3. Server validates chat membership and streams:
  - one `history` frame on connect,
  - `new_message` frames for subsequent messages.
4. Client resolves missing epochs using `GET /chat/{chat_id}/{epoch_id}/fetch`,
  decrypts message payloads locally, and renders immediately.

#### B. Background / offline flow (Android push wake)

1. Mobile client registers an FCM token using `POST /device/fcm/register`
  (`platform` currently `android`).
2. When a sender calls `POST /chat/{chat_id}/message`, server persists the message
  first and broadcasts over WebSocket to online devices.
3. If recipient devices are not currently active in that chat WebSocket, server
  sends an FCM wake push to enabled tokens for that user/device set.
4. Wake push payload contains only metadata (`chat_id`, sender identifiers,
  timestamp, generic body text). It never includes ciphertext, epoch keys, or
  private key material.
5. Woken client then fetches encrypted data through API/WebSocket and performs
  decryption locally.

#### C. Token lifecycle and reliability

- Register/update token: `POST /device/fcm/register`.
- Disable current device token: `DELETE /device/fcm/current`.
- List token records: `GET /device/fcm/tokens`.
- On logout, backend disables the current device token automatically.
- Backend tracks delivery outcomes (`failure_count`, invalid-token state) and
  disables tokens marked invalid by FCM.

#### D. Security invariants

- Push is a wake hint, not a transport for protected message content.
- Full message confidentiality remains end-to-end via client-side key handling.
- Device scoping remains enforced by `(Bearer token, X-Device-ID)` pairing.

---

## 4. Cryptographic Implementations by Language

This section describes **recommended standard APIs** to mirror the browser’s WebCrypto behaviour when re‑implementing the protocol in other languages. The exact key sizes, curves, modes, and hash functions must match those above.

### 4.1 Java

Use the standard Java Cryptography Architecture (JCA) and, where needed, a reputable provider (e.g. Bouncy Castle) for HKDF.

- **PBKDF2 (password → AES key)**
  - Class: `javax.crypto.SecretKeyFactory`
  - Algorithm: `PBKDF2WithHmacSHA256`
  - Spec: `javax.crypto.spec.PBEKeySpec`
  - KeySpec parameters:
    - Password: `char[]`
    - Salt: 32 bytes
    - Iterations: 100000
    - Derived key length: 256 bits

- **AES‑GCM (encrypt/decrypt)**
  - Class: `javax.crypto.Cipher`
  - Transformation: `"AES/GCM/NoPadding"`
  - Key: `javax.crypto.SecretKey` (from `SecretKeySpec`)
  - IV: 12‑byte random nonce (`GCMParameterSpec` with 128‑bit tag)

- **ECDH P‑384 (identity keys & shared secret)**
  - `KeyPairGenerator` with algorithm `"EC"` and curve `secp384r1`.
  - `KeyAgreement` with algorithm `"ECDH"`.
  - Export keys via `KeyFactory` using `X509EncodedKeySpec` (public / SPKI) and `PKCS8EncodedKeySpec` (private).

- **HKDF‑SHA‑256 (derive epoch wrap key)**
  - Preferred: `org.bouncycastle.crypto.generators.HKDFBytesGenerator` with `SHA-256`.
  - Salt: 32 bytes (all zeros, or agreed constant).
  - `info`: UTF‑8 bytes of `"epoch-key-wrap"`.

### 4.2 C / C++

Use a modern, well‑maintained library. Two good options are **OpenSSL** or **libsodium**. Below are OpenSSL‑style APIs (1.1.1+ or 3.x) that map cleanly to the JavaScript logic.

- **PBKDF2 (password → AES key)**
  - Function: `PKCS5_PBKDF2_HMAC` with `EVP_sha256()`.
  - Parameters:
    - Password bytes
    - 32‑byte salt
    - Iterations: 100000
    - Output length: 32 bytes (256‑bit key)

- **AES‑256‑GCM (encrypt/decrypt)**
  - API: `EVP_CIPHER_CTX`, cipher `EVP_aes_256_gcm()`.
  - IV: 12 bytes.
  - Tag: 16 bytes (128‑bit default).

- **ECDH P‑384**
  - Key generation: `EVP_PKEY_CTX` with `EVP_PKEY_EC`, curve `NID_secp384r1`.
  - Shared secret: `EVP_PKEY_derive_init` / `EVP_PKEY_derive`.
  - Export/import keys via standard X.509 (SPKI) and PKCS#8 routines (`PEM_write_bio_PUBKEY`, `PEM_write_bio_PrivateKey`, etc.).

- **HKDF‑SHA‑256**
  - API: `EVP_PKEY_CTX` with `EVP_PKEY_HKDF` (OpenSSL 1.1.1+).
  - Set parameters:
    - Mode: extract‑and‑expand.
    - Salt: 32 bytes (must match frontend).
    - IKM: ECDH shared secret bytes.
    - Info: `"epoch-key-wrap"` (UTF‑8 bytes).
    - Output length: 32 bytes (AES‑256 key).

If using **libsodium** instead, use:

- `crypto_pwhash` (Argon2id) as a stronger PBKDF replacement (adjust server and protocol accordingly).
- `crypto_aead_aes256gcm_*` or `crypto_aead_chacha20poly1305_*` for AEAD (only if all endpoints agree on cipher).

### 4.3 Rust

Prefer a vetted crypto crate such as **ring** or the RustCrypto ecosystem.

- **PBKDF2**
  - Crate: `ring::pbkdf2` or `pbkdf2` from RustCrypto.
  - Algorithm: HMAC‑SHA‑256.
  - Iterations: 100000, output 32 bytes.

- **AES‑GCM**
  - Crate: `aes-gcm` (RustCrypto AEAD collection).
  - Type: `Aes256Gcm`.
  - Key: 32‑byte key (`Key<Aes256Gcm>`).
  - Nonce: 12‑byte `Nonce`.

- **ECDH P‑384**
  - Crate: `p384` (RustCrypto elliptic curves) with `ecdh` or `elliptic-curve` traits.
  - Use `EphemeralSecret` / `PublicKey` or equivalent to derive shared secret bytes.

- **HKDF‑SHA‑256**
  - Crate: `hkdf` (RustCrypto).
  - Algorithm: `Sha256`.
  - Inputs: ECDH shared secret, 32‑byte salt, `info = b"epoch-key-wrap"`.
  - Output: 32‑byte AES key.

### 4.4 Python

Use the **cryptography** library (https://cryptography.io/).

- **PBKDF2 (password → AES key)**
  - Class: `cryptography.hazmat.primitives.kdf.pbkdf2.PBKDF2HMAC`.
  - Algorithm: `hashes.SHA256()`.
  - Salt: 32 bytes.
  - Iterations: 100000.
  - Length: 32 bytes.

- **AES‑256‑GCM**
  - Class: `cryptography.hazmat.primitives.ciphers.aead.AESGCM`.
  - Key: 32‑byte random key.
  - Nonce: 12‑byte random nonce.

- **ECDH P‑384**
  - Curve: `ec.SECP384R1()`.
  - Classes: `ec.generate_private_key`, `private_key.exchange(ec.ECDH(), peer_public_key)`.
  - Public key encoding: `public_bytes(encoding=serialization.Encoding.DER, format=serialization.PublicFormat.SubjectPublicKeyInfo)`.
  - Private key encoding: `private_bytes(..., format=serialization.PrivateFormat.PKCS8, ...)`.

- **HKDF‑SHA‑256**
  - Class: `cryptography.hazmat.primitives.kdf.hkdf.HKDF`.
  - Algorithm: `hashes.SHA256()`.
  - Salt: 32 bytes (constant zero array to match frontend).
  - Info: `b"epoch-key-wrap"`.
  - Length: 32 bytes.

### 4.5 JavaScript / Node.js (npm)

For browser frontends, use the standard **Web Crypto API** (`window.crypto.subtle`).
For Node.js, prefer `crypto.webcrypto.subtle` (Node 19+ / modern LTS). Only fall
back to additional npm libraries when you cannot rely on built‑in primitives.

- **PBKDF2 (password → AES key)**
  - Browser / Node (WebCrypto):
    - Import password bytes as a raw key with `subtle.importKey("raw", ...)`.
    - Use `subtle.deriveKey` with algorithm `{ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }`.
    - Derive an `AES-GCM` key with length 256 bits.
  - Node fallback (if WebCrypto is unavailable): `crypto.pbkdf2` from `node:crypto`
    with SHA‑256, 32‑byte salt, 100 000 iterations, 32‑byte output.

- **AES‑256‑GCM (encrypt/decrypt)**
  - Browser / Node (WebCrypto): use `subtle.encrypt` / `subtle.decrypt` with
    `{ name: "AES-GCM", iv }` where `iv` is a 12‑byte random nonce. Keys are
    256‑bit AES‑GCM keys derived from PBKDF2 or generated via `subtle.generateKey`.
  - Ciphertext + authentication tag are concatenated; encode ciphertext and
    nonce in base64 before sending to the server.
  - Node fallback: `crypto.createCipheriv("aes-256-gcm", key, iv)` /
    `crypto.createDecipheriv("aes-256-gcm", key, iv)`.

- **ECDH P‑384 (identity keys & shared secret)**
  - Browser / Node (WebCrypto):
    - Generate keys with `subtle.generateKey({ name: "ECDH", namedCurve: "P-384" }, ...)`.
    - Export public key in SPKI via `exportKey("spki", publicKey)`.
    - Export private key in PKCS#8 via `exportKey("pkcs8", privateKey)`.
    - Derive shared secret bits with `subtle.deriveBits({ name: "ECDH", public: peerPublicKey }, privateKey, bitLength)`.
  - Node fallback: `crypto.createECDH("secp384r1")` from `node:crypto`.

- **HKDF‑SHA‑256 (derive epoch wrap key)**
  - Browser / Node (WebCrypto): use `subtle.deriveKey` or `subtle.deriveBits`
    with algorithm `{ name: "HKDF", hash: "SHA-256", salt, info }`, where:
    - `salt` is a fixed 32‑byte value (all zeros, or agreed constant) matching
      the rest of the ecosystem.
    - `info` is UTF‑8 bytes of `"epoch-key-wrap"`.
    - Output length: 32 bytes (AES‑256 key).
  - Node fallback: `crypto.hkdf` / `crypto.hkdfSync` from `node:crypto` with
    SHA‑256, same salt, info, and 32‑byte output.

If a WebCrypto implementation is needed in older environments, use a
well‑maintained polyfill such as `@peculiar/webcrypto` or a modern AEAD library
like `libsodium-wrappers` that can match these parameters exactly.

### 4.6 React Native

React Native does not provide WebCrypto or Node’s `crypto` by default. A mobile
client **MUST** implement the same cryptographic algorithms and parameters as the
web client, using React-Native-compatible libraries (typically native-backed or
pure-JS/WASM).

Where possible, prefer a **single, well-maintained crypto suite** that exposes
all required primitives via a consistent API to reduce integration risk.

---

#### Randomness

- Use `react-native-get-random-values` to polyfill `crypto.getRandomValues`.
- This MUST be used for generating all nonces, salts, and private keys.

---

#### PBKDF2 (passphrase → encryption key)

- Use an audited implementation of **PBKDF2-HMAC-SHA-256** with configurable
  parameters (e.g. a React Native binding to platform KDF APIs or a maintained
  crypto suite).
- Parameters **MUST** be:
  - Iterations: **100 000**
  - Salt length: **32 bytes**
  - Output length: **32 bytes**
- PBKDF2 **MUST ONLY** be used to derive keys for encrypting long-term private
  key material.
- PBKDF2 **MUST NOT** be used for message keys, epoch keys, or any high-frequency
  derivations.

---

#### AEAD (encrypt / decrypt)

- Use a native AEAD implementation of **AES-256-GCM**.
- Parameters **MUST** be:
  - Key size: **256 bits**
  - Nonce size: **12 bytes**
  - Authentication tag size: **16 bytes**
- Associated Data (AAD) **MUST** be used to authenticate contextual metadata
  (e.g. `chat_id`, `epoch_id`, `sender_id`). The AAD is not encrypted but **MUST**
  be identical during encryption and decryption.
- Ciphertext storage format **MUST** be:

nonce || ciphertext || tag

base64-encoded for transport and storage.

---

#### Asymmetric key agreement (identity keys & shared secret)

- Use **X25519 (Curve25519)** for identity keys and ECDH.
- The implementation **MUST** expose raw 32-byte public and private keys.
- X25519 is required to ensure interoperability across browsers, React Native,
and backend environments with consistent security properties.
- The raw shared secret output from X25519 **MUST NOT** be used directly as an
encryption key.

---

#### HKDF (derive wrapping / epoch keys)

- Use **HKDF-SHA-256** with explicit parameters (do not rely on library defaults).
- Parameters **MUST** be:
- Salt length: **32 bytes**
- Info string: `"epoch-key-wrap"`
- Output length: **32 bytes**
- HKDF output is used to derive symmetric keys for epoch key wrapping and related
purposes.

---

#### Implementation guidance

- All cryptographic operations occur client-side; the server never performs
encryption, decryption, or key derivation.
- Libraries that rely on `window.crypto.subtle` **MUST NOT** be used.
- Libraries must be actively maintained and suitable for both iOS and Android
runtimes.

This ensures the React Native client is cryptographically equivalent to the web
client while remaining portable, auditable, and safe to implement.

---

## 5. Implementation Quality Requirements

- All cryptographic operations must use **constant‑time** primitives from well‑maintained libraries; do not implement primitives manually.
- Do not weaken parameters (iterations, key sizes, curves) without a formal migration plan.
- New frontends (mobile/desktop/native) must:
  - Conform to the same data formats (base64 encodings, key encodings, field names).
  - Use the same algorithms and parameters as specified.
  - Pass interoperability tests against the reference browser implementation (key generation, epoch wrapping, message encryption/decryption).

Any deviation from this specification must be explicitly documented and undergo a security review before being shipped.
