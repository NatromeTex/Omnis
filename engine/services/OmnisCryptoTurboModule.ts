import NativeCryptoModule, { type NativeCryptoInterface } from "./NativeCryptoModule";

export type { NativeCryptoInterface };

// Stable boundary name used by the app layer; implementation remains in Kotlin TurboModule.
export const OmnisCryptoTurboModule: NativeCryptoInterface = NativeCryptoModule;
