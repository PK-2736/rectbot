// Minimal local typings to satisfy TypeScript in this repo until proper @types/* are installed.
declare module 'lucide-react' {
  const content: unknown;
  export = content;
}

declare module 'react' {
  const React: unknown;
  export default React;
  export type ReactNode = unknown;
  export interface Context<T = unknown> {
    Provider: any;
    Consumer: any;
  }
  export function useState<T = unknown>(initial?: T): [T, (v: T | ((prev: T) => T)) => void];
  export function useEffect(cb: () => void | (() => void), deps?: unknown[]): void;
  export function useCallback<T extends (...args: unknown[]) => unknown>(fn: T, deps?: unknown[]): T;
  export function createContext<T = unknown>(defaultValue?: T): Context<T>;
  export function useContext<T = unknown>(context: Context<T>): T;
}

declare const process: { env?: { [k: string]: string | undefined } };

declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: unknown;
  }
}
