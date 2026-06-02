import { IDomainEvent } from './DomainEvents';
import { GameWebSocketServer } from '../../websocket';

export class DomainEventDispatcher {
  /**
   * Broadcasts the successfully committed event over the WebSocket server
   */
  public static async dispatch(event: IDomainEvent): Promise<void> {
    try {
      console.log(`[Event Dispatcher] Dispatching committed event: ${event.eventName} to Company ${event.companyId}`);
      
      // Relays safely via central socket gateway
      GameWebSocketServer.sendToCompany(event.companyId, event.eventName, event.payload);
    } catch (error) {
      console.error(`[Event Dispatcher] Failed to dispatch event ${event.eventName}:`, error);
    }
  }
}
