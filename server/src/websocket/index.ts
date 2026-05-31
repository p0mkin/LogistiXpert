import { IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import url from 'url';
import { verifyWSHandshakeToken, JWTPayload } from '../middleware/auth';
import { WSMessageSchema, makeErrorResponse } from './protocol';
import { AuctionSocketHandler } from './auction.handler';
import { BorderSocketHandler } from './border.handler';
import { WSConnectionLimiter } from './limiter';

// Extends the standard WebSocket to track session states
export interface AuthenticatedWebSocket extends WebSocket {
  user?: JWTPayload;
  isAlive?: boolean;
}

export class GameWebSocketServer {
  private wss: WebSocketServer;
  
  // Maps userId -> set of active WebSockets (allows multi-device sessions)
  public static clientsRegistry = new Map<string, Set<AuthenticatedWebSocket>>();

  constructor(server: any) {
    this.wss = new WebSocketServer({ noServer: true });

    // Mount to the server HTTP connection upgrades
    server.on('upgrade', (request: IncomingMessage, socket: any, head: any) => {
      const pathname = url.parse(request.url || '').pathname;

      if (pathname === '/ws') {
        this.wss.handleUpgrade(request, socket, head, (ws) => {
          this.wss.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    });

    this.initialize();
  }

  private initialize() {
    this.wss.on('connection', (ws: AuthenticatedWebSocket, req: IncomingMessage) => {
      ws.isAlive = true;

      // Parse authorization query parameters on connection upgrade handshake
      const parameters = url.parse(req.url || '', true).query;
      const token = parameters.token as string;

      if (!token) {
        ws.send(JSON.stringify(makeErrorResponse('AUTH_REQUIRED', 'WebSocket connection requires a auth token')));
        ws.close(4001, 'Unauthorized');
        return;
      }

      const decoded = verifyWSHandshakeToken(token);
      if (!decoded) {
        ws.send(JSON.stringify(makeErrorResponse('AUTH_INVALID', 'Auth token is expired or invalid')));
        ws.close(4002, 'Forbidden');
        return;
      }

      // Track connection registry
      ws.user = decoded;
      GameWebSocketServer.registerClient(decoded.id, ws);

      console.log(`[WS] Client Connected: ${decoded.username} (${decoded.id})`);

      // Heartbeat ping-pong listener
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      // Packet Routing Dispatcher
      ws.on('message', async (data: string) => {
        try {
          // Token Bucket Rate Limit check
          if (!WSConnectionLimiter.consume(ws)) {
            ws.send(JSON.stringify(makeErrorResponse('RATE_LIMIT_EXCEEDED', 'Rate limit exceeded. Too many packets sent.')));
            return;
          }

          const rawMessage = JSON.parse(data);
          const parsed = WSMessageSchema.safeParse(rawMessage);

          if (!parsed.success) {
            ws.send(JSON.stringify(makeErrorResponse('BAD_PROTOCOL', 'Invalid message wrapper format')));
            return;
          }

          const { type, payload, requestId } = parsed.data;

          // Route events
          switch (type) {
            case 'ping':
              ws.send(JSON.stringify({ type: 'pong', payload: {}, replyTo: requestId }));
              break;

            case 'auction:bid':
              await AuctionSocketHandler.handleBid(ws, payload, requestId);
              break;

            case 'border:calculate_clearance':
              await BorderSocketHandler.handleClearance(ws, payload, requestId);
              break;

            default:
              ws.send(JSON.stringify(makeErrorResponse('UNKNOWN_EVENT', `Event type '${type}' is not supported`, requestId)));
              break;
          }
        } catch (error) {
          ws.send(JSON.stringify(makeErrorResponse('SERVER_ERROR', 'Internal error processing packet')));
        }
      });

      // Cleanup on close
      ws.on('close', () => {
        if (ws.user) {
          GameWebSocketServer.unregisterClient(ws.user.id, ws);
          WSConnectionLimiter.cleanup(ws.user.id);
          console.log(`[WS] Client Disconnected: ${ws.user.username}`);
        }
      });

      ws.on('error', (err) => {
        console.error(`[WS] Error on client connection ${ws.user?.username}:`, err);
      });
    });

    // Run active keep-alive interval loops every 30 seconds
    setInterval(() => {
      this.wss.clients.forEach((ws: AuthenticatedWebSocket) => {
        if (ws.isAlive === false) {
          if (ws.user) GameWebSocketServer.unregisterClient(ws.user.id, ws);
          return ws.terminate();
        }

        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);
  }

  // ==========================================
  // REGISTRY HELPERS
  // ==========================================
  private static registerClient(userId: string, ws: AuthenticatedWebSocket) {
    if (!this.clientsRegistry.has(userId)) {
      this.clientsRegistry.set(userId, new Set());
    }
    this.clientsRegistry.get(userId)!.add(ws);
  }

  private static unregisterClient(userId: string, ws: AuthenticatedWebSocket) {
    const list = this.clientsRegistry.get(userId);
    if (list) {
      list.delete(ws);
      if (list.size === 0) {
        this.clientsRegistry.delete(userId);
      }
    }
  }

  /**
   * Broadcast message to every client connected on the server
   */
  public static broadcast(type: string, payload: any) {
    const message = JSON.stringify({ type, payload });
    this.clientsRegistry.forEach((sockets) => {
      sockets.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        }
      });
    });
  }

  /**
   * Send target message to specific user's open sockets (supports multi-device)
   */
  public static sendToUser(userId: string, type: string, payload: any) {
    const message = JSON.stringify({ type, payload });
    const sockets = this.clientsRegistry.get(userId);
    if (sockets) {
      sockets.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        }
      });
    }
  }
}
