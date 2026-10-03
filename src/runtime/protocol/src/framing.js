// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
const FRAME_HEADER_LENGTH = 4;
const MAX_UINT32 = 4294967295;
const PAYLOAD_BLOCK_SIZE = 64 * 1024;
const DEFAULT_MAX_FRAME_LENGTH = 16 * 1024 * 1024;
class FrameError extends Error {
  constructor(message) {
    super(message);
    this.name = "FrameError";
  }
}
function resolveMaxFrameLength(options) {
  const value = options?.maxFrameLength ?? DEFAULT_MAX_FRAME_LENGTH;
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_UINT32) {
    throw new RangeError(`maxFrameLength must be an integer between 0 and ${MAX_UINT32}`);
  }
  return value;
}
function encodeFrame(payload) {
  if (!(payload instanceof Uint8Array)) throw new TypeError("Frame payload must be a Uint8Array");
  if (payload.byteLength > MAX_UINT32) throw new RangeError("Frame payload exceeds the unsigned 32-bit length limit");
  const frame = new Uint8Array(FRAME_HEADER_LENGTH + payload.byteLength);
  const length = payload.byteLength;
  frame[0] = length >>> 24;
  frame[1] = length >>> 16;
  frame[2] = length >>> 8;
  frame[3] = length;
  frame.set(payload, FRAME_HEADER_LENGTH);
  return frame;
}
function assertCompleteFrame(frame, options) {
  if (!(frame instanceof Uint8Array)) throw new TypeError("Frame must be a Uint8Array");
  if (frame.byteLength < FRAME_HEADER_LENGTH) throw new FrameError("Frame does not contain a complete length prefix");
  const length = frame[0] * 16777216 + frame[1] * 65536 + frame[2] * 256 + frame[3];
  const maxFrameLength = resolveMaxFrameLength(options);
  if (length > maxFrameLength) {
    throw new FrameError(`Frame length ${length} exceeds configured limit of ${maxFrameLength}`);
  }
  if (frame.byteLength !== FRAME_HEADER_LENGTH + length) {
    throw new FrameError("Frame must contain exactly one complete payload");
  }
}
class FrameDecoder {
  header = new Uint8Array(FRAME_HEADER_LENGTH);
  headerLength = 0;
  maxFrameLength;
  payloadBlocks = [];
  currentPayloadBlock;
  currentPayloadBlockLength = 0;
  expectedPayloadLength;
  payloadLength = 0;
  state = "open";
  constructor(options) {
    this.maxFrameLength = resolveMaxFrameLength(options);
  }
  push(chunk) {
    if (this.state === "ended") throw new FrameError("Frame decoder has ended");
    if (this.state === "failed") throw new FrameError("Frame decoder has failed");
    if (!(chunk instanceof Uint8Array)) throw new TypeError("Frame chunk must be a Uint8Array");
    const frames = [];
    let chunkOffset = 0;
    while (chunkOffset < chunk.byteLength) {
      if (this.expectedPayloadLength === void 0) {
        const headerBytes = Math.min(FRAME_HEADER_LENGTH - this.headerLength, chunk.byteLength - chunkOffset);
        this.header.set(chunk.subarray(chunkOffset, chunkOffset + headerBytes), this.headerLength);
        this.headerLength += headerBytes;
        chunkOffset += headerBytes;
        if (this.headerLength < FRAME_HEADER_LENGTH) continue;
        const frameLength = this.header[0] * 16777216 + this.header[1] * 65536 + this.header[2] * 256 + this.header[3];
        this.headerLength = 0;
        if (frameLength > this.maxFrameLength) {
          this.fail(`Frame length ${frameLength} exceeds configured limit of ${this.maxFrameLength}`);
        }
        if (frameLength === 0) {
          frames.push(new Uint8Array());
          continue;
        }
        this.expectedPayloadLength = frameLength;
        this.payloadBlocks = [];
        this.currentPayloadBlock = void 0;
        this.currentPayloadBlockLength = 0;
        this.payloadLength = 0;
      }
      const expectedPayloadLength = this.expectedPayloadLength;
      if (expectedPayloadLength === void 0) continue;
      while (chunkOffset < chunk.byteLength && this.payloadLength < expectedPayloadLength) {
        let block = this.currentPayloadBlock;
        if (!block || this.currentPayloadBlockLength === block.byteLength) {
          block = new Uint8Array(Math.min(PAYLOAD_BLOCK_SIZE, expectedPayloadLength - this.payloadLength));
          this.payloadBlocks.push(block);
          this.currentPayloadBlock = block;
          this.currentPayloadBlockLength = 0;
        }
        const payloadBytes = Math.min(
          block.byteLength - this.currentPayloadBlockLength,
          chunk.byteLength - chunkOffset
        );
        block.set(chunk.subarray(chunkOffset, chunkOffset + payloadBytes), this.currentPayloadBlockLength);
        this.currentPayloadBlockLength += payloadBytes;
        this.payloadLength += payloadBytes;
        chunkOffset += payloadBytes;
      }
      if (this.payloadLength === expectedPayloadLength) {
        if (this.payloadBlocks.length === 1) {
          frames.push(this.payloadBlocks[0]);
        } else {
          const payload = new Uint8Array(expectedPayloadLength);
          let offset = 0;
          for (const payloadBlock of this.payloadBlocks) {
            payload.set(payloadBlock, offset);
            offset += payloadBlock.byteLength;
          }
          frames.push(payload);
        }
        this.payloadBlocks = [];
        this.currentPayloadBlock = void 0;
        this.currentPayloadBlockLength = 0;
        this.expectedPayloadLength = void 0;
        this.payloadLength = 0;
      }
    }
    return frames;
  }
  end() {
    if (this.state === "ended") throw new FrameError("Frame decoder has ended");
    if (this.state === "failed") throw new FrameError("Frame decoder has failed");
    if (this.headerLength !== 0 || this.expectedPayloadLength !== void 0) {
      this.fail("Truncated frame at end of stream");
    }
    this.state = "ended";
  }
  fail(message) {
    this.state = "failed";
    this.headerLength = 0;
    this.payloadBlocks = [];
    this.currentPayloadBlock = void 0;
    this.currentPayloadBlockLength = 0;
    this.expectedPayloadLength = void 0;
    this.payloadLength = 0;
    throw new FrameError(message);
  }
}
export {
  DEFAULT_MAX_FRAME_LENGTH,
  FrameDecoder,
  FrameError,
  assertCompleteFrame,
  encodeFrame
};
