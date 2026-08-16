import { TlvQrService } from './tlv-qr.service';

describe('TlvQrService', () => {
  const service = new TlvQrService();

  it('encodes each field as tag(1 byte) + length(1 byte) + UTF-8 value, concatenated and Base64-encoded', () => {
    const base64 = service.encode({
      sellerName: 'Acme',
      vatNumber: '300000000000003',
      timestamp: '2024-05-01T12:30:00',
      invoiceTotal: '115.00',
      vatTotal: '15.00',
    });

    const buffer = Buffer.from(base64, 'base64');
    let offset = 0;
    const fields: { tag: number; value: string }[] = [];
    while (offset < buffer.length) {
      const tag = buffer.readUInt8(offset);
      const length = buffer.readUInt8(offset + 1);
      const value = buffer.subarray(offset + 2, offset + 2 + length).toString('utf8');
      fields.push({ tag, value });
      offset += 2 + length;
    }

    expect(fields).toEqual([
      { tag: 1, value: 'Acme' },
      { tag: 2, value: '300000000000003' },
      { tag: 3, value: '2024-05-01T12:30:00' },
      { tag: 4, value: '115.00' },
      { tag: 5, value: '15.00' },
    ]);
  });

  it('uses the UTF-8 BYTE length (not character count) for a multi-byte seller name', () => {
    // Arabic text - each character is typically 2 UTF-8 bytes, so byte
    // length must differ from .length (character count) for this to be a
    // meaningful test.
    const sellerName = 'متجر البقالة';
    const base64 = service.encode({
      sellerName,
      vatNumber: '300000000000003',
      timestamp: '2024-05-01T12:30:00',
      invoiceTotal: '10.00',
      vatTotal: '1.30',
    });

    const buffer = Buffer.from(base64, 'base64');
    const declaredLength = buffer.readUInt8(1);
    const expectedByteLength = Buffer.from(sellerName, 'utf8').length;
    expect(declaredLength).toBe(expectedByteLength);
    expect(declaredLength).not.toBe(sellerName.length); // proves this isn't just character count
    const decodedValue = buffer.subarray(2, 2 + declaredLength).toString('utf8');
    expect(decodedValue).toBe(sellerName);
  });

  it('produces a stable, deterministic output for the same input', () => {
    const fields = {
      sellerName: 'Acme',
      vatNumber: '300000000000003',
      timestamp: '2024-05-01T12:30:00',
      invoiceTotal: '115.00',
      vatTotal: '15.00',
    };
    expect(service.encode(fields)).toBe(service.encode(fields));
  });

  it('throws rather than silently truncating a field longer than 255 bytes', () => {
    const tooLong = 'x'.repeat(256);
    expect(() =>
      service.encode({
        sellerName: tooLong,
        vatNumber: '300000000000003',
        timestamp: '2024-05-01T12:30:00',
        invoiceTotal: '10.00',
        vatTotal: '1.30',
      }),
    ).toThrow();
  });
});
