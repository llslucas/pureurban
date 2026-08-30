import { buildQrPayload, decodeQrPayload, encodeQrPayload } from '@/utils/qr-payload'

const STUDENT_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
const SESSION_ID = '9a7b1c2d-3e4f-4a5b-8c9d-0e1f2a3b4c5d'

describe('encodeQrPayload / decodeQrPayload round-trip', () => {
  it('decodes exactly the two valid fields it encoded', () => {
    const encoded = encodeQrPayload(buildQrPayload(STUDENT_ID, SESSION_ID))
    expect(decodeQrPayload(encoded)).toEqual({ studentId: STUDENT_ID, sessionId: SESSION_ID })
  })

  it('normalizes uppercase UUIDs to lowercase', () => {
    const encoded = encodeQrPayload({
      studentId: STUDENT_ID.toUpperCase(),
      sessionId: SESSION_ID.toUpperCase(),
    })
    expect(decodeQrPayload(encoded)).toEqual({ studentId: STUDENT_ID, sessionId: SESSION_ID })
  })

  it('drops extra fields instead of leaking them', () => {
    const raw = JSON.stringify({
      studentId: STUDENT_ID,
      sessionId: SESSION_ID,
      admin: true,
      tripId: 'injected',
    })
    const decoded = decodeQrPayload(raw)
    expect(decoded).toEqual({ studentId: STUDENT_ID, sessionId: SESSION_ID })
    expect(Object.keys(decoded ?? {}).sort()).toEqual(['sessionId', 'studentId'])
  })
})

describe('decodeQrPayload rejects forged / malformed input with null and never throws', () => {
  const cases: Record<string, string> = {
    emptyString: '',
    posterUrl: 'https://example.com/promo',
    truncatedJson: `{"studentId":"${STUDENT_ID}","sessionId":`,
    jsonNull: 'null',
    jsonArray: `["${STUDENT_ID}","${SESSION_ID}"]`,
    jsonString: `"${STUDENT_ID}"`,
    jsonNumber: '42',
    missingSessionId: JSON.stringify({ studentId: STUDENT_ID }),
    missingStudentId: JSON.stringify({ sessionId: SESSION_ID }),
    nonUuidStudentId: JSON.stringify({ studentId: 'not-a-uuid', sessionId: SESSION_ID }),
    uuidWrongLength: JSON.stringify({ studentId: STUDENT_ID.slice(0, -1), sessionId: SESSION_ID }),
    numericStudentId: JSON.stringify({ studentId: 123, sessionId: SESSION_ID }),
    nullSessionId: JSON.stringify({ studentId: STUDENT_ID, sessionId: null }),
    wifiQr: 'WIFI:S:BusDepot;T:WPA;P:secret;;',
    vcardQr: 'BEGIN:VCARD\nVERSION:3.0\nFN:John\nEND:VCARD',
  }

  for (const [name, raw] of Object.entries(cases)) {
    it(`returns null for ${name}`, () => {
      let result: unknown
      expect(() => {
        result = decodeQrPayload(raw)
      }).not.toThrow()
      expect(result).toBeNull()
    })
  }
})
