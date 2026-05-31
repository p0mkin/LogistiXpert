import { WebSocket } from 'ws';
import { JWTPayload } from '../middleware/auth';
export interface AuthenticatedWebSocket extends WebSocket {
    user?: JWTPayload;
    isAlive?: boolean;
}
export declare class GameWebSocketServer {
    private wss;
    static clientsRegistry: Map<string, Set<AuthenticatedWebSocket>>;
    constructor(server: any);
    private initialize;
    private static registerClient;
    private static unregisterClient;
    /**
     * Broadcast message to every client connected on the server
     */
    static broadcast(type: string, payload: any): void;
    /**
     * Send target message to specific user's open sockets (supports multi-device)
     */
    static sendToUser(userId: string, type: string, payload: any): void;
}
