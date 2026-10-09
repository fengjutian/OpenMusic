declare module '@lynx-js/types' {
  interface GlobalProps {
    /**
     * Injected by the Android host (see android/app/src/main/java/.../MainActivity.kt).
     * Absent on Windows/Web — callers must treat every field as optional and must
     * have a working fallback, per technical spec §11.
     */
    openmusic?: {
      /** Bundled JS entry, injected by the native template. */
      templateUrl?: string;
    };
  }
}

export {};