# Omnis Rebuild Architecture Notes

## Scope Applied In This Pass

This pass establishes the new chat-runtime foundation with Gifted Chat while preserving existing backend, crypto, and media contracts.

- Gifted Chat is now the chat rendering/input layer.
- Omnis message/domain models remain unchanged.
- A dedicated adapter maps Omnis models to Gifted Chat models.
- Optimistic send states are explicit in UI (`sending`, `failed`, resolved on success).
- Existing native crypto/media pipelines are preserved and still invoked through services.
- Existing dark AMOLED color scheme is preserved in chat UI surfaces.
- Message send and epoch creation now use bounded exponential backoff with jitter on transient failures.
- Media chunk upload/download now use bounded exponential backoff with jitter and explicit `retrying` state.
- WebSocket reconnect now uses bounded exponential backoff with jitter.

## Layer Boundaries

- UI layer: `engine/screens/ChatScreen.tsx`
- Adapter layer: `engine/chat/giftedAdapter.ts`
- UI state model: `engine/chat/model.ts`
- Domain/runtime services (existing): `engine/context/ChatContext.tsx`, `engine/services/*`
- Native boundaries (facades):
  - `engine/services/OmnisCryptoTurboModule.ts`
  - `engine/services/OmnisMediaTurboModule.ts`

## Contracts Preserved

- Auth headers and session model remain unchanged.
- WebSocket auth handshake remains unchanged.
- Epoch-based encryption/decryption workflow remains unchanged.
- Attachment upload/download flow remains unchanged.
- Message send payload shape and media reference flow remain unchanged.

## Known Gaps Remaining For Full Spec Completion

- End-to-end background upload ownership still resides mostly in current media service flow; a complete WorkManager-first orchestration pass is still needed.
- More explicit persistent state machines for message/upload jobs can be expanded beyond current optimistic + upload progress behavior.
- Contract/interoperability test suites (crypto vectors and API contract tests) are not yet added in this pass.
- Full account/session hardening and resilience test matrix from the rebuild spec is still pending.
