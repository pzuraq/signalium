import debug from 'debug';

const defaultSignaliumDebug = debug('signalium');

/**
 * Log a message to the console.
 * 
 * Wrapper around https://github.com/debug-js/debug.
 * 
 * @param message - The message to log
 * @param args - The arguments to log
 */
export function log(message: string, ...args: unknown[]) {
  defaultSignaliumDebug(message, ...args);
}
