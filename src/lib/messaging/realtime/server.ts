import "server-only";

import { WebSocketServer } from "ws";
import { MessagingGateway } from "./gateway";

/**
 * Standalone messaging realtime server bootstrap.
 *
 * This module provides a concrete entrypoint for running the messaging
 * WebSocket gateway as a dedicated Node.js process or custom server.
 *
 * Usage:
 *   import { createMessagingRealtimeServer } from "@/lib/messaging/realtime/server";
 *   const { wss, gateway } = createMessagingRealtimeServer({ port: 8080 });
 *
 * Architecture note:
 * - In the current Next.js App Router deployment model, this server should be
 *   started as a separate service or inside a custom Node.js server wrapper.
 * - The bootstrap HTTP endpoint lives in the Next.js app and returns the
 *   configured public WebSocket URL (MESSAGING_REALTIME_WS_URL).
 * - This factory keeps the gateway reusable for later deployment evolution
 *   (container, Edge runtime, etc.).
 */

export interface MessagingRealtimeServerOptions {
  port: number;
  tokenSecret?: string;
  idleTimeoutMs?: number;
  sweepIntervalMs?: number;
  clockSkewSeconds?: number;
}

export interface MessagingRealtimeServer {
  wss: WebSocketServer;
  gateway: MessagingGateway;
  close(): Promise<void>;
}

export function createMessagingRealtimeServer(
  options: MessagingRealtimeServerOptions,
): MessagingRealtimeServer {
  const secret = options.tokenSecret ?? process.env.MESSAGING_REALTIME_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "MESSAGING_REALTIME_TOKEN_SECRET is not configured or is too short (< 32 chars).",
    );
  }

  const wss = new WebSocketServer({ port: options.port });

  const gateway = new MessagingGateway({
    tokenSecret: secret,
    idleTimeoutMs: options.idleTimeoutMs,
    sweepIntervalMs: options.sweepIntervalMs,
    clockSkewSeconds: options.clockSkewSeconds,
  });

  gateway.attach(wss);

  return {
    wss,
    gateway,
    close(): Promise<void> {
      return new Promise((resolve) => {
        gateway.destroy();
        wss.close(() => resolve());
      });
    },
  };
}

/**
 * If this module is executed directly (e.g., via `node` or `tsx`),
 * start the server using MESSAGING_REALTIME_PORT from the environment.
 *
 * Example:
 *   MESSAGING_REALTIME_PORT=8080 MESSAGING_REALTIME_TOKEN_SECRET=... node server.js
 */
if (require.main === module) {
  const port = parseInt(process.env.MESSAGING_REALTIME_PORT ?? "8080", 10);
  const server = createMessagingRealtimeServer({ port });

  console.info(`[messaging-realtime] Gateway listening on ws://localhost:${port}`);

  process.on("SIGTERM", () => {
    console.info("[messaging-realtime] SIGTERM received, closing...");
    server.close().then(() => process.exit(0));
  });

  process.on("SIGINT", () => {
    console.info("[messaging-realtime] SIGINT received, closing...");
    server.close().then(() => process.exit(0));
  });
}
