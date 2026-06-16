import { Buffer } from "buffer";

export function toBuffer(data: ArrayBuffer): Buffer {
  return Buffer.from(data);
}
