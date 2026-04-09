import { createHash, randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";

type RealtimePayload = {
  type: string;
  [key: string]: unknown;
};

type Frame = {
  opcode: number;
  payload: Buffer;
};

type RealtimeConnection = {
  id: string;
  socket: Duplex;
  buffer: Buffer;
};

const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const REALTIME_PATH = "/api/realtime/ws";
const clients = new Map<string, RealtimeConnection>();

const makeAcceptKey = (key: string): string =>
  createHash("sha1").update(`${key}${WS_GUID}`).digest("base64");

const encodeFrame = (opcode: number, payload: Buffer = Buffer.alloc(0)): Buffer => {
  const payloadLength = payload.length;
  const head: number[] = [0x80 | (opcode & 0x0f)];

  if (payloadLength < 126) {
    head.push(payloadLength);
  } else if (payloadLength < 65536) {
    head.push(126, (payloadLength >> 8) & 0xff, payloadLength & 0xff);
  } else {
    const high = Math.floor(payloadLength / 2 ** 32);
    const low = payloadLength >>> 0;
    head.push(
      127,
      (high >> 24) & 0xff,
      (high >> 16) & 0xff,
      (high >> 8) & 0xff,
      high & 0xff,
      (low >> 24) & 0xff,
      (low >> 16) & 0xff,
      (low >> 8) & 0xff,
      low & 0xff
    );
  }

  return Buffer.concat([Buffer.from(head), payload]);
};

const encodeTextFrame = (text: string): Buffer =>
  encodeFrame(0x1, Buffer.from(text, "utf8"));

const decodeFrames = (input: Buffer): { frames: Frame[]; remaining: Buffer } => {
  const frames: Frame[] = [];
  let offset = 0;

  while (offset + 2 <= input.length) {
    const first = input[offset] ?? 0;
    const second = input[offset + 1] ?? 0;
    const opcode = first & 0x0f;
    const isMasked = Boolean(second & 0x80);
    let payloadLength = second & 0x7f;
    let cursor = offset + 2;

    if (payloadLength === 126) {
      if (cursor + 2 > input.length) break;
      payloadLength = input.readUInt16BE(cursor);
      cursor += 2;
    } else if (payloadLength === 127) {
      if (cursor + 8 > input.length) break;
      const big = input.readBigUInt64BE(cursor);
      if (big > BigInt(Number.MAX_SAFE_INTEGER)) break;
      payloadLength = Number(big);
      cursor += 8;
    }

    const maskLength = isMasked ? 4 : 0;
    if (cursor + maskLength + payloadLength > input.length) break;

    const maskKey = isMasked ? input.subarray(cursor, cursor + 4) : null;
    cursor += maskLength;

    const payload = Buffer.from(input.subarray(cursor, cursor + payloadLength));
    if (maskKey) {
      for (let i = 0; i < payload.length; i += 1) {
        payload[i] = payload[i]! ^ maskKey[i % 4]!;
      }
    }

    frames.push({ opcode, payload });
    offset = cursor + payloadLength;
  }

  return { frames, remaining: input.subarray(offset) };
};

const cleanupConnection = (id: string): void => {
  clients.delete(id);
};

const sendJson = (socket: Duplex, payload: RealtimePayload): void => {
  try {
    socket.write(encodeTextFrame(JSON.stringify({ ...payload, ts: Date.now() })));
  } catch {
    // Ignore send errors and let socket lifecycle clean up.
  }
};

const isRealtimeUpgrade = (req: IncomingMessage): boolean => {
  const host = req.headers.host ?? "localhost";
  const path = new URL(req.url ?? "/", `http://${host}`).pathname;
  return path === REALTIME_PATH;
};

export const sendRealtimeEvent = (connectionId: string, payload: RealtimePayload): boolean => {
  const conn = clients.get(connectionId);
  if (!conn) return false;
  sendJson(conn.socket, payload);
  return true;
};

const onSocketData = (conn: RealtimeConnection, chunk: Buffer): void => {
  conn.buffer = Buffer.concat([conn.buffer, chunk]);
  const { frames, remaining } = decodeFrames(conn.buffer);
  conn.buffer = remaining;

  for (const frame of frames) {
    if (frame.opcode === 0x8) {
      try {
        conn.socket.end(encodeFrame(0x8));
      } finally {
        cleanupConnection(conn.id);
      }
      return;
    }

    if (frame.opcode === 0x9) {
      conn.socket.write(encodeFrame(0xA, frame.payload));
      continue;
    }
  }
};

const handleRealtimeUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer): void => {
  const key = req.headers["sec-websocket-key"];
  const version = req.headers["sec-websocket-version"];
  const normalizedKey = Array.isArray(key) ? key[0] : key;
  const normalizedVersion = Array.isArray(version) ? version[0] : version;

  if (!normalizedKey || normalizedVersion !== "13") {
    socket.destroy();
    return;
  }

  const accept = makeAcceptKey(normalizedKey);
  const responseHeaders = [
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
  ];
  socket.write(`${responseHeaders.join("\r\n")}\r\n\r\n`);

  const connectionId = randomUUID();
  const conn: RealtimeConnection = { id: connectionId, socket, buffer: Buffer.alloc(0) };
  clients.set(connectionId, conn);

  sendJson(socket, {
    type: "realtime:welcome",
    connectionId,
    message: "Realtime connected",
  });

  if (head.length > 0) {
    onSocketData(conn, head);
  }

  socket.on("data", (chunk: Buffer) => {
    onSocketData(conn, chunk);
  });

  socket.on("error", () => {
    cleanupConnection(connectionId);
  });

  socket.on("close", () => {
    cleanupConnection(connectionId);
  });
};

export const attachRealtimeServer = (server: HttpServer): void => {
  server.on("upgrade", (req, socket, head) => {
    if (!isRealtimeUpgrade(req)) {
      socket.destroy();
      return;
    }
    handleRealtimeUpgrade(req, socket, head);
  });
};
