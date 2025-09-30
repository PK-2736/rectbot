// Minimal local typings to satisfy TypeScript in this repo until proper @types/* are installed.
declare module 'lucide-react' {
  const content: any;
  export = content;
}

declare module 'react' {
  const React: any;
  export default React;
  export function useState<T = any>(initial?: T): [T, (v: any) => void];
  export function useEffect(cb: () => void | (() => void), deps?: any[]): void;
  export function useCallback<T extends (...args: any[]) => any>(fn: T, deps?: any[]): T;
}

declare const process: any;

declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}
