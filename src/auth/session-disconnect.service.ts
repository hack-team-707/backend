import { Injectable } from '@nestjs/common';

type DisconnectHandler = (sessionId: string) => void | Promise<void>;

@Injectable()
export class SessionDisconnectService {
  private readonly handlers = new Set<DisconnectHandler>();

  register(handler: DisconnectHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async disconnect(sessionId: string): Promise<void> {
    await Promise.all(
      [...this.handlers].map((handler) => Promise.resolve(handler(sessionId))),
    );
  }

  async disconnectMany(sessionIds: string[]): Promise<void> {
    await Promise.all(
      sessionIds.map((sessionId) => this.disconnect(sessionId)),
    );
  }
}
