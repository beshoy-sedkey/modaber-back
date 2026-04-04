import { Test, TestingModule } from '@nestjs/testing';
import { EncryptionService } from '../encryption.service';

describe('EncryptionService', () => {
  let service: EncryptionService;

  beforeEach(async () => {
    process.env['ENCRYPTION_KEY'] = 'test-encryption-key-for-unit-tests';

    const module: TestingModule = await Test.createTestingModule({
      providers: [EncryptionService],
    }).compile();

    service = module.get<EncryptionService>(EncryptionService);
  });

  it('should encrypt and decrypt a string correctly', () => {
    const plaintext = 'sensitive-data-12345';
    const encrypted = service.encrypt(plaintext);
    const decrypted = service.decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('should produce different ciphertext for the same plaintext (random IV)', () => {
    const plaintext = 'same-input';
    const first = service.encrypt(plaintext);
    const second = service.encrypt(plaintext);
    expect(first).not.toBe(second);
  });

  it('should encrypt and decrypt empty string', () => {
    const plaintext = '';
    const encrypted = service.encrypt(plaintext);
    const decrypted = service.decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('should throw when decrypting tampered ciphertext', () => {
    const encrypted = service.encrypt('some-data');
    const parts = encrypted.split(':');
    parts[2] = 'deadbeef'.repeat(8); // tamper with encrypted data
    const tampered = parts.join(':');
    expect(() => service.decrypt(tampered)).toThrow();
  });
});
