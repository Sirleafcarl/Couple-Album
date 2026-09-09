import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

type DecodedHeic = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

type HeicDecode = (input: { buffer: Uint8Array }) => Promise<DecodedHeic>;

const decode = require('heic-decode') as HeicDecode;

export async function decodeHeic(bytes: Uint8Array): Promise<DecodedHeic> {
  return decode({ buffer: bytes });
}
