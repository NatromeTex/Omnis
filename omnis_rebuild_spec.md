# Omnis React Native Rebuild Specification

This document is the implementation brief for rebuilding the Omnis mobile app as a React Native application using **Gifted Chat** for the chat UI, while preserving the existing backend/API contracts, cryptographic contracts, and media pipeline contracts defined in the project documents.

This is not a greenfield “make a chat app” prompt. It is a constrained rebuild of an existing secure messaging system with explicit protocol, cryptography, session, and media requirements. The implementation must preserve those contracts unless this document explicitly states otherwise.

---

## 1. Objective

Rebuild the mobile app so that it is:

- stable
- modular
- maintainable
- responsive under real-world use
- resilient during media upload/download
- aligned with the existing backend and cryptographic contracts

The app must use:

- **React Native** for the main application
- **Gifted Chat** as the chat UI foundation
- **Kotlin TurboModules** for:
  - cryptographic operations
  - media/background upload orchestration
- native background execution for long-running media uploads so uploads can continue even if the app is backgrounded or terminated, subject to platform constraints

The rebuilt app must avoid the current “thin threads holding everything together” failure mode. The architecture must be explicit, layered, and hard to misuse.

---

## 2. Non-Negotiable Core Requirements

## 2.1 Preserve backend/API contracts

The implementation must conform to the existing REST/WebSocket/media contracts already defined for Omnis, including authentication, chats, messages, epochs, sessions, media upload, media download, and attachment semantics.

The app must preserve:

- session-based auth using bearer token + device id
- one-to-one chats
- WebSocket auth handshake model
- epoch-based message encryption workflow
- two-step media upload + message reference workflow
- chunked media upload semantics
- attachment metadata and download pipeline
- session listing/revocation UX
- user search/chat creation behaviour

Do not redesign the wire protocol unless there is a blocking implementation reason, and if so, isolate it behind an adapter and document the deviation clearly.

---

## 2.2 Crypto must be implemented in a Kotlin TurboModule

All sensitive cryptographic operations must be implemented in a **Kotlin TurboModule**, not in ad hoc JavaScript libraries sprinkled throughout the app.

This module is the source of truth for client-side cryptography.

It must own at minimum:

- secure randomness generation
- identity keypair generation
- password-based key derivation
- encryption/decryption of the encrypted private key blob
- epoch key generation
- epoch key wrapping/unwrapping
- message encryption/decryption
- media encryption/decryption
- base64/byte encoding helpers only where needed for protocol interoperability

JavaScript/TypeScript must treat the crypto layer as an API boundary, not as a place to re-implement primitives.

No manual crypto implementations are allowed.

---

## 2.3 Media/background upload must be implemented in a Kotlin TurboModule

All non-trivial media work must also be handled by a **Kotlin TurboModule** backed by Android-native background execution primitives.

This module must own at minimum:

- media encryption
- chunking
- streamed multipart upload
- retry strategy
- resumable upload state tracking
- upload completion detection
- progress reporting
- background continuation after app background/termination where platform permits
- local persisted upload queue / job store

Uploads that are not effectively instant must become managed background jobs. The UI must not directly “babysit” long uploads.

The JS layer should enqueue work and observe job state. It must not be the system responsible for keeping uploads alive.

---

## 2.4 Good user feel is a first-class requirement

The rebuilt app must feel coherent, sturdy, and predictable.

This is not optional polish. Good user feel is part of the architecture.

The app must avoid:

- screens blocking on avoidable work
- spinners without explanation
- message bubbles popping in with late re-layout chaos
- uploads disappearing or silently failing
- crypto/network/media operations coupled directly to rendering lifecycles
- fragile “open screen = work happens, leave screen = work dies” behaviour
- inconsistent attachment states
- unexplained loading delays
- duplicate sends / phantom retries

The app must emphasize:

- immediate local feedback
- deterministic state transitions
- optimistic UI where safe
- background continuity
- durable queues
- clear progress and failure states
- smooth message list behaviour
- no jank during crypto/media work

---

## 3. Source Contracts to Preserve

This rebuild must preserve the contracts described in the following existing project documents:

- database/schema contract
- REST and WebSocket API contract
- frontend cryptographic and behavioural contract

These define the present system semantics, including but not limited to:

### 3.1 Authentication and session model

- authentication is session-based
- authenticated requests require:
  - `Authorization: Bearer <token>`
  - `X-Device-ID: <uuid-v4>`
- login is device-scoped
- session listing and revocation are part of the product surface

### 3.2 Crypto model

- the server does not decrypt messages or media
- long-term identity key material is client-generated and client-protected
- message bodies are opaque ciphertext on the server
- epoch keys are client-generated and wrapped per peer
- private identity key material must never persist unencrypted

### 3.3 Chat/message model

- one-to-one chats only
- real-time delivery via WebSocket
- scrollback/pagination via REST
- messages reference `epoch_id`
- replies are supported
- attachment metadata is part of the message payload

### 3.4 Media model

- media is uploaded separately from message send
- uploads are chunked
- server stores encrypted blobs only
- messages reference uploaded media by `media_ids`
- downloads are chunk-based and reassembled client-side
- decryption happens client-side after reassembly

These contracts are binding.

---

## 4. Technology Direction

## 4.1 React Native app layer

Use React Native for:

- app shell
- navigation
- screen composition
- state management
- WebSocket lifecycle orchestration
- API orchestration
- local view models
- chat rendering through Gifted Chat
- attachment preview UI
- upload/download progress UI
- session/account management UI

Preferred language: **TypeScript**

---

## 4.2 Chat UI layer

Use **react-native-gifted-chat** as the base chat component.

Gifted Chat is a rendering/input foundation, not the product architecture.

Do not force backend contracts to match Gifted Chat internally. Instead:

- keep Omnis domain models intact
- build a dedicated adapter to map Omnis message/view state into Gifted Chat’s message shape
- map attachment state, pending state, failed state, local-only optimistic state, and decrypted text into Gifted Chat render props

Gifted Chat must be treated as a replaceable UI layer, not as the canonical message model.

---

## 4.3 Native Android layer

Use Kotlin TurboModules for the two heavy native systems:

1. **OmnisCryptoTurboModule**
2. **OmnisMediaTurboModule**

The Android app should also use the correct Android background execution primitives, such as:

- **WorkManager** for durable background jobs
- foreground services when required by platform rules and user-visible ongoing work
- persisted job metadata in local storage/DB
- OS-safe resumable patterns

Do not invent a pseudo-background system in JS timers.

---

## 5. Required High-Level Architecture

The app must be built in clear layers.

A recommended structure:

```text
React Native UI
  ├── Screens
  ├── Gifted Chat presentation
  ├── View models / state stores
  └── Domain orchestration layer

Domain layer
  ├── Auth service
  ├── Session service
  ├── Chat service
  ├── Message service
  ├── Epoch service
  ├── Attachment service
  ├── Upload job service
  └── WebSocket service

Infrastructure layer
  ├── REST client
  ├── WebSocket client
  ├── local persistence
  ├── cache/indexes
  ├── OmnisCryptoTurboModule bridge
  └── OmnisMediaTurboModule bridge

Native layer
  ├── Kotlin TurboModule: crypto
  ├── Kotlin TurboModule: media
  ├── WorkManager / background workers
  ├── local upload/download persistence
  └── platform media/file access
```

The key design rule is:

**rendering code must not directly own crypto, chunking, network retries, or upload lifetime.**

---

## 6. Mandatory Separation of Responsibilities

## 6.1 JavaScript/TypeScript responsibilities

JS/TS is responsible for:

- screen flow
- state transitions
- API orchestration
- calling TurboModules
- observing native job state
- optimistic message insertion
- reconciliation of server-confirmed messages
- mapping to Gifted Chat message shape
- account/session UX
- search/create chat UX
- decrypt-when-ready presentation flow
- retries initiated by product policy, not byte-level upload logic

JS must not perform heavy encryption/chunk streaming loops for production paths.

---

## 6.2 Kotlin crypto module responsibilities

The crypto TurboModule must provide a stable API covering:

- generate identity keypair
- export public key in protocol format
- encrypt/decrypt private key blob using password-derived key
- derive password key with required parameters
- generate epoch keys
- wrap/unwrap epoch keys
- encrypt/decrypt message payloads
- encrypt/decrypt media payloads
- generate secure random bytes / nonces / salts
- zeroize or minimize sensitive material lifetime where possible
- return protocol-compatible base64 outputs

Any cryptographic constants must match the required Omnis contracts exactly.

If the current backend or web reference implementation defines specific encodings or payload structures, the TurboModule must match them exactly.

---

## 6.3 Kotlin media module responsibilities

The media TurboModule must provide:

- file intake from a URI/path handed off by JS
- media metadata inspection
- local job creation
- encryption of file payload for upload
- chunk planning
- chunked multipart upload
- durable progress tracking
- retry/backoff
- completion detection
- local persistence of upload job state
- job restoration after process death
- background continuation
- ability to return attachment references usable by message send logic
- optional local thumbnail/previews where feasible

The native media system should expose a high-level job API to JS, for example:

- enqueue upload
- observe upload state
- cancel upload
- resume upload
- get active/pending/completed uploads
- map upload completion to returned `media_ids` / `upload_id`

JS should not know or care how chunk loops are implemented internally.

---

## 7. Cryptographic Requirements to Preserve

Unless formally reviewed and changed across the whole ecosystem, preserve the existing crypto contract exactly.

That includes the currently specified frontend requirements such as:

- PBKDF2 with SHA-256, 100000 iterations, 32-byte salt, 32-byte output for password-based key derivation
- AES-GCM for private key encryption
- epoch-based AES-GCM message encryption
- epoch wrapping using shared secret + HKDF + AEAD according to the project contract
- protocol-compatible nonce lengths, encoding rules, and payload structures
- no persistent storage of raw passwords, raw decrypted private keys, or raw epoch keys

The current frontend spec includes React Native-specific crypto guidance. If there is a discrepancy between older web-oriented descriptions and RN-specific requirements, do not hand-wave it away. The rebuild agent must:

1. identify the effective contract actually used by the backend and existing clients
2. preserve interoperability
3. document any mismatch clearly
4. implement one coherent client path

Interoperability is mandatory. Silent drift is unacceptable.

### 7.1 Sensitive data handling

The app must not persist:

- raw password
- raw decrypted identity private key
- raw epoch keys

Allowed persistent storage is limited to things such as:

- auth token
- device id
- current user id/username
- non-sensitive UI/application state
- durable upload job metadata
- encrypted or non-sensitive caches only where justified

If secure device storage is used for some sensitive-but-allowed state, document it explicitly.

---

## 8. Media Upload/Download Requirements

## 8.1 Upload workflow

The upload path must preserve the current contract:

1. user selects file
2. app creates upload job immediately
3. UI shows deterministic pending upload state immediately
4. native media module encrypts file
5. native media module splits into chunks respecting size rules
6. native media module streams chunks to `/media/upload`
7. native layer persists progress after each successful chunk
8. once upload is complete, the app obtains message-attachable media reference(s)
9. message send uses `media_ids` against `/chat/{chat_id}/message`

The user should not need to keep the chat screen open for this to finish.

---

## 8.2 Backgrounding and app termination

A core requirement:

**media uploads that are not instant must continue through a durable background process, including after the app is closed, as far as platform rules permit.**

On Android this means:

- use WorkManager-backed durable jobs
- where necessary, use foreground service semantics for long-running visible transfers
- persist upload state durably
- restore unfinished work on next process start
- keep JS out of the critical path

The system must be designed so that a user can:

- start upload
- leave the chat
- switch apps
- lock phone
- reopen later

and see consistent progress / completion / recoverable failure state.

---

## 8.3 Download workflow

Downloads should also be robust:

1. read attachment metadata from message payload
2. plan chunk fetches
3. stream-download chunks
4. persist temporary chunk state if needed
5. reassemble in order
6. decrypt via crypto module
7. present/open/share the resulting file safely

Large downloads should not freeze rendering.

Where appropriate, downloads should also be job-based rather than tied to one screen lifecycle.

---

## 9. Good User Feel Requirements

This section is binding. The rebuild should optimize not only correctness but also perceived stability and coherence.

## 9.1 Immediate feedback

When the user sends text:

- show the message immediately in pending state
- do not wait for round trip before rendering locally
- if encryption is required before send, keep that work fast and off the render-critical path
- pending/sent/failed must be visibly distinct

When the user attaches media:

- show attachment immediately as queued/pending
- show upload progress deterministically
- preserve attachment placeholder even if upload is ongoing in background
- do not make the user guess whether the app “took” the action

---

## 9.2 Durable state transitions

Every major object should have explicit state.

For example, message states may include:

- local_drafting
- encrypting
- queued
- sending
- sent
- failed

Upload states may include:

- queued
- preparing
- encrypting
- chunking
- uploading
- paused
- retrying
- completed
- failed
- canceled

These states must be represented in the domain model and UI. Avoid boolean soup.

---

## 9.3 No screen-lifecycle coupling

The app must not behave as though work only exists while a screen is mounted.

Chat screen unmounting must not kill:

- uploads
- decryption caches
- WebSocket ownership if broader session logic should retain it
- message retry state
- media job bookkeeping

Work should be owned by services/stores/native jobs, not screen components.

---

## 9.4 Smooth message list behaviour

Message list behaviour must remain calm and predictable:

- stable keys
- no excessive re-sorting churn
- no bubble jumps caused by late mutation of shape
- attachment placeholders should reserve sensible space
- timestamps/status icons should update without relaying out the whole list badly
- optimistic messages should reconcile cleanly to server-confirmed entries

Do not let decryption completion cause chaotic reorder or visual popping.

---

## 9.5 Clear failure modes

When something fails, the user must see:

- what failed
- whether it can retry
- whether text is safe locally
- whether upload is still queued
- whether network or auth expired
- whether a message failed because media is incomplete

No silent failures.
No “tap and hope”.
No disappearing messages.

---

## 9.6 Offline and flaky network behaviour

Assume the network is bad.

The app must degrade gracefully:

- messages can remain queued
- uploads retry sensibly
- retries back off
- the UI explains waiting/retrying state
- reconnect logic is centralized
- duplicate sends are prevented

The user should feel that the app is patient and deliberate, not broken.

---

## 9.7 Navigation feel

Opening a chat should feel fast even if full decryption or attachment hydration is still in progress.

That means:

- render cached skeleton/history quickly
- decrypt progressively
- hydrate attachments progressively
- avoid blank screens while waiting for every dependent operation to complete

“Fast enough to trust” matters.

---

## 10. Account, Session, and Device UX Requirements

The rebuilt app must include account/session management features consistent with the existing contract:

- list sessions
- identify current session/device
- revoke one session
- revoke all other sessions

The `deviceId` must be durable and stable for the app instance.

Auth/session expiration must be handled gracefully:

- clear explanation
- redirect path that does not corrupt local state
- queued work policy clearly defined

---

## 11. Chat Runtime Requirements

## 11.1 WebSocket ownership

The app should centralize WebSocket management in a service, not in each bubble/list component.

The WebSocket service should handle:

- open/close
- auth frame handshake
- history frame ingestion
- new message ingestion
- ping/pong
- reconnect strategy
- duplicate suppression
- fan-out to stores/view models

---

## 11.2 Pagination / scrollback

Use REST fetch for older messages per the existing contract.

Pagination must integrate cleanly with Gifted Chat and local decrypted caches.

Do not block the active chat experience while historical decryption catches up.

---

## 11.3 Epoch handling

The app must implement the specified epoch workflow correctly:

- each message references an `epoch_id`
- missing epoch keys must be fetched and unwrapped
- epoch keys should be cached only in-memory or in another explicitly reviewed secure strategy
- messages must decrypt against the correct epoch
- send path must ensure a valid current epoch is available

The epoch lifecycle must live in a dedicated service, not scattered across UI code.

---

## 12. Gifted Chat Integration Requirements

Gifted Chat should be used as a UI rendering layer only.

Implement an adapter that maps Omnis domain models to Gifted Chat message objects.

This adapter must support:

- text messages
- replies
- outgoing/incoming
- timestamps
- pending/sent/failed states
- attachment summaries
- local preview states
- “upload in progress” rendering
- “tap to retry” for failed send/upload where appropriate

Custom renderers should be used for:

- attachment cards/previews
- upload progress
- failed states
- media placeholders
- message action affordances

Do not twist the domain model to match Gifted Chat internals.

---

## 13. Persistence Strategy

Use local persistence for durable app state where justified.

Recommended persisted categories:

- auth token
- device id
- current user id / username
- chat list cache
- minimal message cache / indexing metadata
- durable upload job metadata
- job-to-message correlation metadata
- non-sensitive UI preferences

Sensitive materials must not be casually persisted.

If a local DB is used for app state, define schemas explicitly and keep them separate from backend assumptions.

---

## 14. Suggested Delivery Plan for the Rebuild Agent

The rebuild should proceed in disciplined stages.

### Stage 1: Foundation

- set up RN TypeScript project
- integrate navigation, state, API client, config
- define domain models matching existing contracts
- define error/state enums
- generate stable device id handling
- create skeleton screens

### Stage 2: Native crypto module

- implement Kotlin TurboModule for crypto
- validate output formats against contract
- create interoperability tests with known vectors
- wire signup/login/keyblob flows

### Stage 3: Core messaging without media

- WebSocket service
- REST history pagination
- epoch fetching/unwrapping
- text encrypt/decrypt path
- Gifted Chat adapter
- optimistic send states
- retry/failure handling

### Stage 4: Native media/background system

- Kotlin TurboModule for media jobs
- file intake
- encryption/chunking/upload
- WorkManager job durability
- progress events/state restoration
- attachment job domain model

### Stage 5: Attachment UX integration

- picker integration
- queued upload placeholders
- completion-to-message attach flow
- download/decrypt/open flow
- preview and failure states

### Stage 6: Account/session hardening

- session list/revoke
- auth expiry handling
- reconnect handling
- queue survival policies

### Stage 7: Polish and performance

- list stability
- transition smoothness
- loading skeletons
- low-jank rendering
- instrumentation/logging
- battery/network sanity review

---

## 15. Testing Requirements

The rebuild is incomplete without tests.

Required test categories:

### 15.1 Contract tests

- signup/login request/response shape
- authenticated headers
- WebSocket auth handshake
- message send/fetch shape
- media upload shape
- attachment metadata handling

### 15.2 Crypto interoperability tests

- password KDF outputs
- private key blob encrypt/decrypt roundtrip
- epoch wrap/unwrap roundtrip
- message encrypt/decrypt roundtrip
- media encrypt/decrypt roundtrip
- compatibility with backend/web reference expectations

### 15.3 State machine tests

- optimistic send -> confirmed
- optimistic send -> failed
- upload queued -> uploading -> completed
- upload interrupted -> restored -> resumed
- auth expired during queued work
- duplicate WebSocket/REST reconciliation

### 15.4 UX/resilience tests

- navigate away during upload
- background app during upload
- terminate app during upload and relaunch
- flaky network during chunk upload
- slow decryption on message list
- reconnect after socket loss

---

## 16. Observability and Debugging Requirements

The app needs real debugging surfaces. Build them in.

Add structured logging around:

- auth/session lifecycle
- WebSocket lifecycle
- epoch fetch/decrypt flow
- message send state transitions
- upload job lifecycle
- chunk retry behaviour
- background worker restoration
- attachment download flow

Logs must avoid leaking plaintext or secret material.

Make it easy to answer:
- why is this message pending?
- why did this upload stall?
- which chunk failed?
- did the worker restore?
- was the epoch missing or invalid?
- did auth expire?

---

## 17. Anti-Patterns to Avoid

The rebuild agent must explicitly avoid these mistakes:

- putting crypto code all over the JS layer
- tying uploads to a mounted chat component
- using Gifted Chat as the domain model
- using timers as a fake background job system
- doing large file processing on the JS thread
- relying on blind booleans like `isLoading`, `isUploading`, `isFailed` without state machines
- silently swallowing failures
- mutating message identity in ways that break list stability
- blocking chat open on every attachment or decryption dependency
- storing raw secrets casually
- redesigning backend semantics for convenience

---

## 18. Deliverables Expected from the Rebuild

The agent rebuilding this app should produce:

- a React Native TypeScript app
- Gifted Chat based chat UI
- Kotlin TurboModule for crypto
- Kotlin TurboModule for media/background uploads
- clear domain/service/infrastructure separation
- durable upload jobs
- preserved backend/API interoperability
- preserved crypto/media contract interoperability
- account/session management UI
- resilient text + media messaging UX
- tests for contract and interoperability
- architecture notes describing decisions and any unavoidable deviations

---

## 19. Final Implementation Standard

The finished app should feel like a system, not a pile of callbacks.

A user should be able to:

- sign up / log in
- open chats quickly
- send encrypted text reliably
- attach media confidently
- leave the app while uploads continue
- come back later and still see truthful state
- understand failures without guessing
- trust that the app is not held together by fragile lifecycle hacks

That standard matters as much as raw protocol correctness.
