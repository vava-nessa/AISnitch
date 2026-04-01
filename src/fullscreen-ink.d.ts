declare module 'fullscreen-ink' {
  import type { ReactElement } from 'react';
  interface FullScreenHandle {
    /** Starts the Ink app and switches to the alternate screen buffer */
    start(): Promise<void>;
    /** Resolves when the Ink app exits */
    waitUntilExit: Promise<void>;
    /** The underlying Ink instance returned by render */
    instance: any;
  }
  /** Wrap a React component to render it fullscreen in the terminal */
  export function withFullScreen(
    component: ReactElement,
    options?: Record<string, unknown>,
  ): FullScreenHandle;
}
