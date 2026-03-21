import NativeMediaModule, { type NativeMediaInterface } from "./NativeMediaModule";

export type { NativeMediaInterface };

// Stable boundary name used by the app layer; implementation remains in Kotlin TurboModule.
export const OmnisMediaTurboModule: NativeMediaInterface = NativeMediaModule;
