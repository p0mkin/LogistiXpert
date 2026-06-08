import { LockService } from '../../../src/services/lock.service';
import { HttpError } from '../../../src/middleware/error';

describe('LockService', () => {
  beforeEach(() => {
    // Clear the active locks before each test to ensure isolation
    // Accessing private static field for testing purposes
    (LockService as any).activeLocks.clear();
  });

  describe('withLock', () => {
    it('should acquire lock, execute callback, and release lock', async () => {
      const key = 'test-key-1';
      const mockResult = { success: true };
      const callback = jest.fn().mockResolvedValue(mockResult);

      const result = await LockService.withLock(key, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(result).toBe(mockResult);

      // Verify lock is released afterwards
      // Attempting to acquire it should succeed
      expect(LockService.acquire(key)).toBe(true);
    });

    it('should throw an HttpError if the lock is already acquired', async () => {
      const key = 'test-key-2';
      const callback = jest.fn().mockResolvedValue(true);

      // Acquire the lock first
      LockService.acquire(key);

      // Attempting to execute withLock should throw
      await expect(LockService.withLock(key, callback)).rejects.toThrow(HttpError);

      try {
        await LockService.withLock(key, callback);
      } catch (error: any) {
        expect(error).toBeInstanceOf(HttpError);
        expect(error.statusCode).toBe(409);
        expect(error.message).toContain('Another member of your corporate co-op is currently performing a conflicting operation');
      }

      // Callback should not have been executed
      expect(callback).not.toHaveBeenCalled();
    });

    it('should release the lock even if the callback throws an error', async () => {
      const key = 'test-key-3';
      const testError = new Error('Callback failed');
      const callback = jest.fn().mockRejectedValue(testError);

      await expect(LockService.withLock(key, callback)).rejects.toThrow(testError);

      expect(callback).toHaveBeenCalledTimes(1);

      // Verify lock is released afterwards
      // Attempting to acquire it should succeed
      expect(LockService.acquire(key)).toBe(true);
    });
  });
});
