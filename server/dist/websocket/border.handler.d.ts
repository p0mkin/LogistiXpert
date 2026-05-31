import { AuthenticatedWebSocket } from './index';
export declare class BorderSocketHandler {
    static handleClearance(ws: AuthenticatedWebSocket, payload: any, requestId?: string): Promise<void>;
}
