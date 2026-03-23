# Omnis Chat API — REST Specification

## Base URL
```
http://localhost:8000
```

All requests and responses use JSON.  
All timestamps are UTC ISO-8601.

---

## Authentication Model

Authentication is **session-based**, scoped to a `(token, device_id)` pair.

### Headers (required on authenticated endpoints)

```
Authorization: Bearer <token>
X-Device-ID: <uuid-v4>
```

- `Authorization` contains the session token returned by `POST /auth/login`.
- `X-Device-ID` is a client-generated UUID v4 that identifies the device / browser instance.

Unless explicitly stated otherwise, all endpoints that depend on authentication
require both headers.

---

## Cryptographic Model (High-Level)

- Each user has a long-term **identity keypair**.
- The **public key** is stored on the server.
- The **private key** is encrypted client-side with a passphrase and stored as an
  opaque blob on the server (the server never sees the passphrase).
- Message bodies are treated as opaque payloads; any end-to-end encryption is
  implemented on the client side.

The API exposes endpoints to upload and retrieve identity key material; it does
not provide server-side encryption or decryption of messages.

---

## Health

### GET /

Simple health check.

**Auth:** none

**Response**
```json
{
  "PING": "PONG"
}
```

---
### GET /version

Server protocol check.

**Auth:** none

**Response**
```json
{
  "version": "50"
}
```

---

## Auth Endpoints

### POST /auth/signup

Creates a new user and stores initial identity key material.

**Auth:** none

**Request body**
```json
{
  "username": "string",
  "password": "string",
  "identity_pub": "string",
  "encrypted_identity_priv": "string",
  "kdf_salt": "string",
  "aead_nonce": "string"
}
```

**Response — 201 Created**
```json
{
  "id": 1,
  "username": "alice"
}
```

Errors:
- `400` — username already exists

---

### POST /auth/login

Authenticates a user and creates a new session for the device.

**Headers**
```
X-Device-ID: <uuid-v4>
User-Agent: <string> (optional)
```

**Request body**
```json
{
  "username": "string",
  "password": "string"
}
```

**Response — 200 OK**
```json
{
  "token": "string"
}
```

Errors:
- `401` — invalid username or password

---

### POST /auth/logout

Logs out the **current session only**.

**Headers**
```
Authorization: Bearer <token>
```

**Response — 200 OK**
```json
{
  "status": "logged out"
}
```

Errors:
- `401` — invalid or unknown token

---

### GET /auth/me

Returns the authenticated user.

**Headers**
```
Authorization: Bearer <token>
X-Device-ID: <uuid-v4>
```

**Response — 200 OK**
```json
{
  "id": 1,
  "username": "string"
}
```

Errors:
- `401` — unauthorized

---

### GET /auth/keyblob

Returns the encrypted identity key material for the authenticated user.

**Headers**
```
Authorization: Bearer <token>
X-Device-ID: <uuid-v4>
```

**Response — 200 OK**
```json
{
  "identity_pub": "string",
  "encrypted_identity_priv": "string",
  "kdf_salt": "string",
  "aead_nonce": "string"
}
```

Errors:
- `401` — unauthorized
- `404` — identity key material not found

---

## Account & Session Management

### GET /users/sessions

Lists all active sessions for the authenticated user.

**Headers**
```
Authorization: Bearer <token>
X-Device-ID: <uuid-v4>
```

**Response — 200 OK**
```json
[
  {
    "id": 12,
    "device_id": "uuid-v4",
    "user_agent": "string or null",
    "last_accessed": "ISO-8601",
    "created_at": "ISO-8601",
    "expires_at": "ISO-8601 or null",
    "current": true
  }
]
```

The `current` field is `true` only for the session corresponding to the
combination of the provided `Authorization` token and `X-Device-ID`.

Errors:
- `401` — unauthorized

---

### GET /users/search

Searches for users by partial username match. Returns up to 7 best matches,
ordered by relevance (exact match first, then prefix matches, then substring
matches, with shorter usernames ranked higher).

The authenticated user is excluded from results.

**Headers**
```
Authorization: Bearer <token>
X-Device-ID: <uuid-v4>
```

**Query parameters**
```
q: string (required, min length 1)  # partial username to search for
```

**Response — 200 OK**
```json
[
  {
    "id": 2,
    "username": "alice"
  },
  {
    "id": 7,
    "username": "alicia"
  }
]
```

Errors:
- `401` — unauthorized
- `422` — missing or invalid query parameter

---

### DELETE /users/sessions/revoke/{session_id}

Revokes a specific session belonging to the authenticated user.

**Headers**
```
Authorization: Bearer <token>
X-Device-ID: <uuid-v4>
```

**Path parameters**
- `session_id` — integer

**Response — 200 OK**
```json
{
  "status": "revoked"
}
```

Errors:
- `401` — unauthorized
- `404` — session not found or does not belong to user

---

### DELETE /users/sessions/revoke_other

Revokes all sessions for the authenticated user **except** the current one.

**Headers**
```
Authorization: Bearer <token>
X-Device-ID: <uuid-v4>
```

**Response — 200 OK**
```json
{
  "status": "other sessions revoked"
}
```

Errors:
- `401` — unauthorized

---

## Device Push Endpoints

Push notifications are used as a wake signal for offline clients. The push
payload never includes message ciphertext or key material. Clients should wake,
then fetch full encrypted message details from `GET /chat/fetch/{chat_id}`.

### POST /device/fcm/register

Registers or updates the Firebase Cloud Messaging token for the current device.

**Headers**
```
Authorization: Bearer <token>
X-Device-ID: <uuid-v4>
```

**Request body**
```json
{
  "fcm_token": "string",
  "platform": "android"
}
```

**Response — 200 OK**
```json
{
  "id": 1,
  "device_id": "uuid-v4",
  "platform": "android",
  "enabled": true,
  "failure_count": 0,
  "invalid_since": null
}
```

Errors:
- `401` — unauthorized
- `400` — invalid platform or missing token

---

### DELETE /device/fcm/current

Disables push delivery for the current device token.

**Headers**
```
Authorization: Bearer <token>
X-Device-ID: <uuid-v4>
```

**Response — 200 OK**
```json
{
  "status": "disabled",
  "updated": 1
}
```

Errors:
- `401` — unauthorized

---

### GET /device/fcm/tokens

Lists Android FCM token records for the authenticated user.

**Headers**
```
Authorization: Bearer <token>
X-Device-ID: <uuid-v4>
```

**Response — 200 OK**
```json
[
  {
    "id": 1,
    "device_id": "uuid-v4",
    "platform": "android",
    "enabled": true,
    "failure_count": 0,
    "invalid_since": null
  }
]
```

Errors:
- `401` — unauthorized

---

## User Public Key Endpoints

### POST /user/pkey/publish

Publishes identity key material for the authenticated user. Fails if a key
already exists.

**Headers**
```
Authorization: Bearer <token>
X-Device-ID: <uuid-v4>
```

**Request body**
```json
{
  "identity_pub": "string",
  "encrypted_identity_priv": "string",
  "kdf_salt": "string",
  "aead_nonce": "string"
}
```

**Response — 201 Created**
```json
{
  "status": "published"
}
```

Errors:
- `401` — unauthorized
- `409` — public key already published

---

### GET /user/pkey/get

Fetches the public identity key for a given username.

**Auth:** none (public lookup)

**Query parameters**
```
username: string (required)
```

**Response — 200 OK**
```json
{
  "username": "string",
  "identity_pub": "string"
}
```

Errors:
- `404` — user not found
- `404` — user has not published a public key

---

## Chat Endpoints

### GET /chat/list

Lists chats for the authenticated user.

**Headers**
```
Authorization: Bearer <token>
X-Device-ID: <uuid-v4>
```

**Response — 200 OK**
```json
[
  {
    "chat_id": 42,
    "with_user": "other_username"
  }
]
```

Errors:
- `401` — unauthorized

---

### POST /chat/create

Creates a one-to-one chat with another user, identified by username.

**Headers**
```
Authorization: Bearer <token>
X-Device-ID: <uuid-v4>
```

**Request body**
```json
{
  "username": "target_username"
}
```

**Response — 200 OK**
```json
{
  "chat_id": 42
}
```

If a chat between the two users already exists, the existing `chat_id` is
returned.

Errors:
- `401` — unauthorized
- `404` — target user not found

---

### WebSocket /chat/ws/{chat_id}

Opens a persistent WebSocket connection for real-time message delivery in a
chat. Replaces polling of `GET /chat/fetch/{chat_id}` for the active chat
window.

**Connection URL**
```
ws://<host>:8000/chat/ws/{chat_id}
```

**Path parameters**
- `chat_id` — integer

**Authentication** is performed via the **first WebSocket message** after the
connection is opened. Credentials are never sent in the URL, avoiding leakage
through server logs, proxy logs, browser history, and referrer headers.

The client must send an `auth` frame as the very first message within 10
seconds of connecting:

```json
{
  "type": "auth",
  "token": "<session_token>",
  "device_id": "<uuid-v4>"
}
```

- `token` — the session token returned by `POST /auth/login`.
- `device_id` — the client-generated UUID v4 device identifier.

If the first frame is not a valid `auth` message, or if the credentials are
invalid, the server closes the connection with code `4001` ("Unauthorized").
If the timeout elapses with no message the connection is also closed with
`4001`.

**Connection lifecycle**

1. The client opens a plain WebSocket connection (no query-param credentials).
2. The client sends an `auth` frame (see above) within 10 seconds.
3. The server validates the `(token, device_id)` pair.
   - On failure the connection is closed with code `4001` ("Unauthorized").
   - If the user is not a member of the chat, closed with `4004` ("Chat not found").
4. Immediately after authentication, the server sends a `history` frame
   containing the last 50 messages (same shape as the old REST response).
5. Whenever a new message is sent via `POST /chat/{chat_id}/message`, the
   server pushes a `new_message` frame to every connected member.
6. The client may send `{"type":"ping"}` at any time; the server replies with
   `{"type":"pong"}`.
7. Either side may close the connection normally.

**Server → Client frames**

*history* (sent once on connect)
```json
{
  "type": "history",
  "messages": [
    {
      "id": 1001,
      "sender_id": 1,
      "epoch_id": 5,
      "reply_id": 1000,
      "ciphertext": "base64-or-opaque-string",
      "nonce": "string",
      "created_at": "ISO-8601",
      "attachments": [
        {
          "upload_id": "uuid-string",
          "mime_type": "image/png",
          "nonce": "string",
          "total_chunks": 1,
          "total_size": 204800,
          "chunks": [
            {
              "media_id": 10,
              "chunk_index": 0,
              "file_size": 204800
            }
          ]
        }
      ]
    }
  ],
  "next_cursor": 1001
}
```

*new_message* (pushed on each new message)
```json
{
  "type": "new_message",
  "message": {
    "id": 1002,
    "sender_id": 2,
    "epoch_id": 5,
    "reply_id": null,
    "ciphertext": "base64-or-opaque-string",
    "nonce": "string",
    "created_at": "ISO-8601",
    "attachments": []
  }
}
```

*pong*
```json
{
  "type": "pong"
}
```

**Client → Server frames**

*auth* (must be the first frame; see Authentication above)
```json
{
  "type": "auth",
  "token": "<session_token>",
  "device_id": "<uuid-v4>"
}
```

*ping*
```json
{
  "type": "ping"
}
```

**Close codes**
| Code | Meaning |
|------|---------|
| 4001 | Unauthorized (bad token / device_id) |
| 4004 | Chat not found or user is not a member |

---

### GET /chat/fetch/{chat_id}

Fetches messages for a chat, in chronological order (oldest to newest).
Primarily used for **scrollback / pagination**; for real-time delivery prefer
the `WebSocket /chat/ws/{chat_id}` endpoint above.

**Headers**
```
Authorization: Bearer <token>
X-Device-ID: <uuid-v4>
```

**Path parameters**
- `chat_id` — integer

**Query parameters**
```
before_id: integer (optional)  # fetch messages with id < before_id
limit: integer (optional, default 50, max 100)
```

**Response — 200 OK**
```json
{
  "messages": [
    {
      "id": 1001,
      "sender_id": 1,
      "epoch_id": 5,
      "reply_id": 1000,
      "ciphertext": "base64-or-opaque-string",
      "nonce": "string",
      "created_at": "ISO-8601",
      "attachments": [
        {
          "upload_id": "uuid-string",
          "mime_type": "image/png",
          "nonce": "string",
          "total_chunks": 1,
          "total_size": 204800,
          "chunks": [
            {
              "media_id": 10,
              "chunk_index": 0,
              "file_size": 204800
            }
          ]
        }
      ]
    }
  ],
  "next_cursor": 1001
}
```

- `next_cursor` is the id of the oldest message in the returned batch, or
  `null` if there are no messages. To page backwards in time, pass this value
  as `before_id` in the next request.
- Each message contains an `epoch_id` field. Use `GET /chat/{chat_id}/{epoch_id}/fetch`
  to retrieve the wrapped epoch key needed for decryption.

Errors:
- `401` — unauthorized
- `404` — chat not found or user is not a member

---

### GET /chat/{chat_id}/{epoch_id}/fetch

Fetches the wrapped epoch key for a specific epoch in a chat.

**Headers**
```
Authorization: Bearer <token>
X-Device-ID: <uuid-v4>
```

**Path parameters**
- `chat_id` — integer
- `epoch_id` — integer

**Response — 200 OK**
```json
{
  "epoch_id": 5,
  "epoch_index": 1,
  "wrapped_key": "base64-or-opaque-string"
}
```

- `wrapped_key` is the epoch key wrapped for the authenticated user.

Errors:
- `401` — unauthorized
- `404` — chat not found or user is not a member
- `404` — epoch not found

---

### POST /chat/{chat_id}/epoch

Creates a new key epoch for a chat. Epochs are used by clients to rotate
message encryption keys.

**Headers**
```
Authorization: Bearer <token>
X-Device-ID: <uuid-v4>
```

**Path parameters**
- `chat_id` — integer

**Request body**
```json
{
  "wrapped_key_a": "base64-or-opaque-string",
  "wrapped_key_b": "base64-or-opaque-string"
}
```

**Response — 201 Created**
```json
{
  "epoch_id": 5,
  "epoch_index": 1
}
```

Errors:
- `401` — unauthorized
- `404` — chat not found or user is not a member
- `400` — epoch rotation not allowed yet (message-count gate not satisfied)
- `429` — epoch creation throttled (too frequent requests)

---

### POST /chat/{chat_id}/message

Sends a message in a chat.

If the recipient is not actively connected to the chat via WebSocket, the
server attempts an Android FCM wake push to the recipient's registered devices.
The push payload contains only wake metadata (`chat_id`, `message_id`, sender
identity, and generic text). The client must fetch full message details from
the API after wake.

**Headers**
```
Authorization: Bearer <token>
X-Device-ID: <uuid-v4>
```

**Path parameters**
- `chat_id` — integer

**Request body**
```json
{
  "epoch_id": 5,
  "ciphertext": "base64-or-opaque-string",
  "nonce": "string",
  "reply_id": 1000,
  "media_ids": [10, 11]
}
```

- `reply_id` is optional (omit or `null` for a non-reply message).
- `media_ids` is optional. When provided, it is a list of `media.id` values
  returned by `POST /media/upload`. Each referenced media must belong to the
  same `chat_id` and all chunks must have been uploaded. The server links all
  chunks of each upload to the message.

**Response — 201 Created**
```json
{
  "id": 1001,
  "epoch_id": 5,
  "created_at": "ISO-8601",
  "attachments": [
    {
      "upload_id": "uuid-string",
      "mime_type": "image/png",
      "nonce": "string",
      "total_chunks": 1,
      "total_size": 204800,
      "chunks": [
        {
          "media_id": 10,
          "chunk_index": 0,
          "file_size": 204800
        }
      ]
    }
  ]
}
```

Errors:
- `401` — unauthorized
- `404` — chat not found or user is not a member
- `409` — unknown epoch
- `409` — stale epoch; a newer epoch exists and must be used
- `409` — epoch not initialized (wrapped keys missing)
- `400` — referenced media not found or does not belong to this chat
- `400` — upload incomplete (not all chunks uploaded)

---

## Media Endpoints

Media attachments (images, GIFs, audio, video, large files) are uploaded
separately from messages using a **two-step upload + reference** workflow:

1. The client uploads encrypted file data chunk-by-chunk via `POST /media/upload`.
2. The upload endpoint returns a `media_id` for each chunk.
3. The client includes one or more `media_id` values in the `media_ids` field
   of `POST /chat/{chat_id}/message` to attach uploaded media to a message.
4. Other clients fetch attachment metadata from the message payload and download
   chunks via `GET /media/download/{media_id}`.

All media files are **encrypted client-side** before upload; the server stores
opaque encrypted blobs and never decrypts them.

### Chunking

Files **must** be sharded into upload envelopes where:

`encrypted_chunk_bytes + chunk_metadata_bytes <= 256 MiB` (`268435456` bytes)

For this API, `chunk_metadata_bytes` means the multipart/form-data metadata for
that chunk request (`upload_id`, `chat_id`, `mime_type`, `nonce`,
`chunk_index`, `total_chunks`, and form boundaries/headers). Clients must keep
metadata small enough that the full envelope stays within 256 MiB.

If the uploaded envelope exceeds this limit, the server rejects the request with
`413`. Clients generate a unique `upload_id` (UUID) to group chunks belonging
to the same logical file, and specify `chunk_index` (0-based) and
`total_chunks` for each part.

### Streaming Pipeline (Contract)

Upload pipeline (client -> server):

1. Media file -> split into ordered chunks.
2. For each chunk, build metadata envelope (`upload_id`, `chunk_index`,
  `total_chunks`, `chat_id`, `mime_type`, `nonce`).
3. Encrypt chunk bytes client-side.
4. Stream each encrypted envelope via `POST /media/upload` (multipart request
  per chunk).
5. Collect returned `media_id` values for message attachment.

Download pipeline (server -> client):

1. Read message `attachments[]`.
2. For each attachment, read `chunks[]` metadata and stream each part via
  `GET /media/download/{media_id}`.
3. Reassemble downloaded chunks by `chunk_index`.
4. Decrypt reassembled encrypted blob client-side using the attachment `nonce`.

---

### POST /media/upload

Uploads a single encrypted chunk envelope of media data (streamed).

**Auth:** required

**Content-Type:** `multipart/form-data`

**Form fields**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | file | yes | The encrypted binary chunk payload |
| `chat_id` | integer | yes | Chat this media belongs to |
| `mime_type` | string | yes | MIME type of the original file (e.g. `image/png`) |
| `nonce` | string | yes | Client-side encryption nonce (base64) |
| `chunk_index` | integer | no | 0-based index of this chunk (default `0`) |
| `total_chunks` | integer | no | Total number of chunks for this upload (default `1`) |
| `upload_id` | string | yes | Client-generated UUID grouping all chunks of one file |

**Response — 201 Created**
```json
{
  "media_id": 10,
  "upload_id": "uuid-string",
  "chunk_index": 0,
  "chunks_uploaded": 1,
  "total_chunks": 3,
  "complete": false
}
```

Errors:
- `401` — unauthorized
- `404` — chat not found or user is not a member
- `400` — invalid chunk_index or total_chunks
- `400` — empty file
- `409` — chunk already uploaded
- `413` — upload envelope (`encrypted chunk + metadata`) exceeds 256 MiB

---

### GET /media/{media_id}/meta

Returns metadata for a media upload, including all chunk information.

**Auth:** required

**Path parameters**
- `media_id` — integer (any chunk id from the upload)

**Response — 200 OK**
```json
{
  "upload_id": "uuid-string",
  "mime_type": "video/mp4",
  "total_chunks": 3,
  "nonce": "base64-string",
  "chunks": [
    {
      "media_id": 10,
      "chunk_index": 0,
      "file_size": 268435456
    },
    {
      "media_id": 11,
      "chunk_index": 1,
      "file_size": 268435456
    },
    {
      "media_id": 12,
      "chunk_index": 2,
      "file_size": 52428800
    }
  ]
}
```

Errors:
- `401` — unauthorized
- `404` — media not found or user is not a member of the chat

---

### GET /media/download/{media_id}

Streams the raw encrypted bytes of a single media chunk.

**Auth:** required

**Path parameters**
- `media_id` — integer

**Response — 200 OK**

Binary file download (`application/octet-stream`).

Errors:
- `401` — unauthorized
- `404` — media not found or user is not a member of the chat
- `404` — file not found on disk

---

## Notes & Non-Goals (Current State)

- The server does not perform any encryption or decryption of messages; it
  stores and returns message bodies as provided by clients.
- Identity private keys are stored only in encrypted form; the server does not
  see user passphrases.
- Key epochs and wrapped epoch keys are managed via the `/chat/{chat_id}/epoch`
  endpoint and retrieved individually via `/chat/{chat_id}/{epoch_id}/fetch`.
- Clients should cache epoch keys locally and only request epoch keys for
  epochs they have not yet decrypted.
- Media files are stored as encrypted blobs. The server never decrypts media.
  Clients are responsible for encrypting media before upload and decrypting
  after download using the nonce associated with each upload.