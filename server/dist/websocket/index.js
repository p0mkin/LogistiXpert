"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameWebSocketServer = void 0;
const ws_1 = require("ws");
const url_1 = __importDefault(require("url"));
const auth_1 = require("../middleware/auth");
const protocol_1 = require("./protocol");
const auction_handler_1 = require("./auction.handler");
const border_handler_1 = require("./border.handler");
const limiter_1 = require("./limiter");
class GameWebSocketServer {
    wss;
    // Maps userId -> set of active WebSockets (allows multi-device sessions)
    static clientsRegistry = new Map();
    constructor(server) {
        this.wss = new ws_1.WebSocketServer({ noServer: true });
        // Mount to the server HTTP connection upgrades
        server.on('upgrade', (request, socket, head) => {
            const pathname = url_1.default.parse(request.url || '').pathname;
            if (pathname === '/ws') {
                this.wss.handleUpgrade(request, socket, head, (ws) => {
                    this.wss.emit('connection', ws, request);
                });
            }
            else {
                socket.destroy();
            }
        });
        this.initialize();
    }
    initialize() {
        this.wss.on('connection', (ws, req) => {
            ws.isAlive = true;
            // Parse authorization query parameters on connection upgrade handshake
            const parameters = url_1.default.parse(req.url || '', true).query;
            const token = parameters.token;
            if (!token) {
                ws.send(JSON.stringify((0, protocol_1.makeErrorResponse)('AUTH_REQUIRED', 'WebSocket connection requires a auth token')));
                ws.close(4001, 'Unauthorized');
                return;
            }
            const decoded = (0, auth_1.verifyWSHandshakeToken)(token);
            if (!decoded) {
                ws.send(JSON.stringify((0, protocol_1.makeErrorResponse)('AUTH_INVALID', 'Auth token is expired or invalid')));
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
            ws.on('message', async (data) => {
                try {
                    // Token Bucket Rate Limit check
                    if (!limiter_1.WSConnectionLimiter.consume(ws)) {
                        ws.send(JSON.stringify((0, protocol_1.makeErrorResponse)('RATE_LIMIT_EXCEEDED', 'Rate limit exceeded. Too many packets sent.')));
                        return;
                    }
                    const rawMessage = JSON.parse(data);
                    const parsed = protocol_1.WSMessageSchema.safeParse(rawMessage);
                    if (!parsed.success) {
                        ws.send(JSON.stringify((0, protocol_1.makeErrorResponse)('BAD_PROTOCOL', 'Invalid message wrapper format')));
                        return;
                    }
                    const { type, payload, requestId } = parsed.data;
                    // Route events
                    switch (type) {
                        case 'ping':
                            ws.send(JSON.stringify({ type: 'pong', payload: {}, replyTo: requestId }));
                            break;
                        case 'auction:bid':
                            await auction_handler_1.AuctionSocketHandler.handleBid(ws, payload, requestId);
                            break;
                        case 'border:calculate_clearance':
                            await border_handler_1.BorderSocketHandler.handleClearance(ws, payload, requestId);
                            break;
                        default:
                            ws.send(JSON.stringify((0, protocol_1.makeErrorResponse)('UNKNOWN_EVENT', `Event type '${type}' is not supported`, requestId)));
                            break;
                    }
                }
                catch (error) {
                    ws.send(JSON.stringify((0, protocol_1.makeErrorResponse)('SERVER_ERROR', 'Internal error processing packet')));
                }
            });
            // Cleanup on close
            ws.on('close', () => {
                if (ws.user) {
                    GameWebSocketServer.unregisterClient(ws.user.id, ws);
                    limiter_1.WSConnectionLimiter.cleanup(ws.user.id);
                    console.log(`[WS] Client Disconnected: ${ws.user.username}`);
                }
            });
            ws.on('error', (err) => {
                console.error(`[WS] Error on client connection ${ws.user?.username}:`, err);
            });
        });
        // Run active keep-alive interval loops every 30 seconds
        setInterval(() => {
            this.wss.clients.forEach((ws) => {
                if (ws.isAlive === false) {
                    if (ws.user)
                        GameWebSocketServer.unregisterClient(ws.user.id, ws);
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
    static registerClient(userId, ws) {
        if (!this.clientsRegistry.has(userId)) {
            this.clientsRegistry.set(userId, new Set());
        }
        this.clientsRegistry.get(userId).add(ws);
    }
    static unregisterClient(userId, ws) {
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
    static broadcast(type, payload) {
        const message = JSON.stringify({ type, payload });
        this.clientsRegistry.forEach((sockets) => {
            sockets.forEach((ws) => {
                if (ws.readyState === ws_1.WebSocket.OPEN) {
                    ws.send(message);
                }
            });
        });
    }
    /**
     * Send target message to specific user's open sockets (supports multi-device)
     */
    static sendToUser(userId, type, payload) {
        const message = JSON.stringify({ type, payload });
        const sockets = this.clientsRegistry.get(userId);
        if (sockets) {
            sockets.forEach((ws) => {
                if (ws.readyState === ws_1.WebSocket.OPEN) {
                    ws.send(message);
                }
            });
        }
    }
}
exports.GameWebSocketServer = GameWebSocketServer;
