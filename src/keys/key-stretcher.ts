import errcode from 'err-code'
import { concat as uint8ArrayConcat } from 'uint8arrays/concat'
import { fromString as uint8ArrayFromString } from 'uint8arrays/from-string'
import * as hmac from '../hmac/index.js'

const cipherMap = {
  'AES-128': {
    ivSize: 16,
    keySize: 16
  },
  'AES-256': {
    ivSize: 16,
    keySize: 32
  },
  Blowfish: {
    ivSize: 8,
    keySize: 32
  }
}

/**
 * Generates a set of keys for each party by stretching the shared key.
 * (myIV, theirIV, myCipherKey, theirCipherKey, myMACKey, theirMACKey)
 */
export async function keyStretcher (cipherType: 'AES-128' | 'AES-256' | 'Blowfish', hash: 'SHA1' | 'SHA256' | 'SHA512', secret: Uint8Array) {
  const cipher = cipherMap[cipherType]

  if (cipher == null) {
    const allowed = Object.keys(cipherMap).join(' / ')
    throw errcode(new Error(`unknown cipher type '${cipherType}'. Must be ${allowed}`), 'ERR_INVALID_CIPHER_TYPE')
  }

  if (hash == null) {
    throw errcode(new Error('missing hash type'), 'ERR_MISSING_HASH_TYPE')
  }

  const cipherKeySize = cipher.keySize
  const ivSize = cipher.ivSize
  const hmacKeySize = 20
  const seed = uint8ArrayFromString('key expansion')
  const resultLength = 2 * (ivSize + cipherKeySize + hmacKeySize)

  const m = await hmac.create(hash, secret)
  let a = await m.digest(seed)

  const result = []
  let j = 0

  while (j < resultLength) {
    const b = await m.digest(uint8ArrayConcat([a, seed]))
    let todo = b.length

    if (j + todo > resultLength) {
      todo = resultLength - j
    }

    result.push(b)
    j += todo
    a = await m.digest(a)
  }

  const half = resultLength / 2
  const resultBuffer = uint8ArrayConcat(result)
  const r1 = resultBuffer.slice(0, half)
  const r2 = resultBuffer.slice(half, resultLength)

  const createKey = (res: Uint8Array) => ({
    iv: res.slice(0, ivSize),
    cipherKey: res.slice(ivSize, ivSize + cipherKeySize),
    macKey: res.slice(ivSize + cipherKeySize)
  })

  return {
    k1: createKey(r1),
    k2: createKey(r2)
  }
}
