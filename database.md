# SQLite Database Schema — Private Chat API

This schema is derived directly from the REST API specification.
All timestamps are stored as UNIX epoch seconds.
Foreign keys must be enabled.

```sql
PRAGMA foreign_keys = ON;
```

---

## Design Decisions

- `device_id` uses **UUID v4** (TEXT, canonical string form)
- Users are global
- Devices are per-user
- Sessions are per-user per-device
- Chats are **1-to-1 only**
- Messages are append-only
- Strong foreign-key integrity
- No premature abstractions

---

## users

```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
```
---

## sessions

Active login sessions bound to a device.

```sql
CREATE TABLE sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    device_id TEXT NOT NULL, -- UUID v4
    session_token TEXT NOT NULL UNIQUE,
    user_agent TEXT,
    created_at INTEGER NOT NULL,
    last_accessed INTEGER,
    expires_at INTEGER,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

---

## chats

Private chat between exactly two users.

Invariant:
Always store the smaller user id as `user_a_id`.

```sql
CREATE TABLE chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_a_id INTEGER NOT NULL,
    user_b_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,

    UNIQUE(user_a_id, user_b_id),
    FOREIGN KEY (user_a_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (user_b_id) REFERENCES users(id) ON DELETE CASCADE
);
```

---

## messages

Chat messages.

```sql
CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    sender_id INTEGER NOT NULL,
    reply_id INTEGER,
    epoch_id INTEGER,
    ciphertext TEXT NOT NULL,
    nonce TEXT NOT NULL,
    created_at INTEGER NOT NULL,

    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (reply_id) REFERENCES messages(id) ON DELETE SET NULL,
    FOREIGN KEY (epoch_id) REFERENCES chat_epochs(id)
);
```

---

## media

Encrypted media chunks stored on disk. Files are sharded into chunks of at most
256 MiB each. All chunks of one logical file share the same `upload_id`.

```sql
CREATE TABLE media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uploader_id INTEGER NOT NULL,
    chat_id INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL,         -- size in bytes
    nonce TEXT NOT NULL,                 -- client-side encryption nonce
    chunk_index INTEGER NOT NULL DEFAULT 0,
    total_chunks INTEGER NOT NULL DEFAULT 1,
    upload_id TEXT NOT NULL,             -- groups chunks of same file
    created_at INTEGER NOT NULL,

    FOREIGN KEY (uploader_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
);
```

---

## message_media

Join table linking messages to their media attachments.

```sql
CREATE TABLE message_media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL,
    media_id INTEGER NOT NULL,

    UNIQUE(message_id, media_id),
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
);
```

---

## Indexes (Required)

```sql
CREATE INDEX idx_sessions_token ON sessions(session_token);
CREATE INDEX idx_messages_chat_time ON messages(chat_id, created_at);
CREATE INDEX idx_messages_reply_id ON messages(reply_id);
CREATE INDEX idx_chats_user_a ON chats(user_a_id);
CREATE INDEX idx_chats_user_b ON chats(user_b_id);
CREATE INDEX idx_media_upload_id ON media(upload_id);
CREATE INDEX idx_media_uploader ON media(uploader_id);
CREATE INDEX idx_message_media_message ON message_media(message_id);
```

---

## API Mapping Summary

- `/auth/register` → `devices`
- `/auth/signup` → `users`
- `/auth/login` → `sessions`
- `/auth/logout` → delete from `sessions`
- `/users/search` → query `users` (partial username match)
- `/chats` → query `chats`
- `/chats/{chat_id}` → query `messages`
- `/chats/{chat_id}/messages` → insert into `messages`
- `/media/upload` → insert into `media` (write chunk to disk)
- `/media/{media_id}/meta` → query `media` (chunk metadata)
- `/media/download/{media_id}` → query `media`, serve file from disk
- `/chat/{chat_id}/message` (with `media_ids`) → insert into `messages` + `message_media`

---

## Notes for Production

- Validate UUID v4 format at the API layer
- Consider rotating session tokens
- Add rate limiting if exposed publicly
- Migrate to WAL mode for concurrency

This schema is intentionally boring. That is a feature.
