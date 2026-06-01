import { HttpError } from '../middleware/error';

export class LockService {
  private static activeLocks = new Set<string>();

  /**
   * Acquires an in-memory lock for a specific resource key.
   * Returns true if lock was successfully acquired, false if it's already locked.
   */
  static acquire(key: string): boolean {
    if (this.activeLocks.has(key)) {
      return false;
    }
    this.activeLocks.add(key);
    return true;
  }

  /**
   * Releases an in-memory lock for a resource key.
   */
  static release(key: string): void {
    this.activeLocks.delete(key);
  }

  /**
   * Helper that executes an asynchronous callback inside a lock.
   * Auto-releases the lock inside a finally block and throws a 409 conflict on failure.
   */
  static async withLock<T>(key: string, callback: () => Promise<T>): Promise<T> {
    const success = this.acquire(key);
    if (!success) {
      throw new HttpError(
        409,
        `Another member of your corporate co-op is currently performing a conflicting operation (${key}). Please retry in a few seconds.`
      );
    }
    try {
      return await callback();
    } finally {
      this.release(key);
    }
  }
}
