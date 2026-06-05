import { generateSecureVin } from '../utils/vinGenerator';

describe('vinGenerator', () => {
  it('should generate a 17-character string when no prefix is provided', () => {
    const vin = generateSecureVin();
    expect(vin.length).toBe(17);
    expect(vin).toMatch(/^[0-9A-F]+$/);
  });

  it('should generate a string starting with the provided prefix', () => {
    const prefix = 'TRK-';
    const vin = generateSecureVin(prefix);
    expect(vin.startsWith(prefix)).toBe(true);
    expect(vin.length).toBe(17 + prefix.length);
  });

  it('should handle long prefixes correctly', () => {
    const prefix = 'VIN-MOO-';
    const vin = generateSecureVin(prefix);
    expect(vin.startsWith(prefix)).toBe(true);
    expect(vin.length).toBe(17 + prefix.length);
  });

  it('should generate unique VINs', () => {
    const vin1 = generateSecureVin();
    const vin2 = generateSecureVin();
    expect(vin1).not.toBe(vin2);
  });
});
