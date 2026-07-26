import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import { Notification } from './entities/notification.entity';

interface SocketTicket {
  sub: string;
  purpose: 'socket';
}

@WebSocketGateway({
  namespace: '/realtime',
  cors: { origin: true, credentials: true },
})
export class NotificationGateway implements OnGatewayConnection {
  @WebSocketServer()
  private readonly server!: Namespace;

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(@ConnectedSocket() client: Socket): Promise<void> {
    try {
      const ticket = client.handshake.auth?.ticket;
      if (typeof ticket !== 'string') throw new Error('Missing socket ticket');
      const payload = await this.jwtService.verifyAsync<SocketTicket>(ticket);
      if (payload.purpose !== 'socket' || !payload.sub)
        throw new Error('Invalid socket ticket');
      client.data.userId = payload.sub;
      await client.join(this.userRoom(payload.sub));
      client.emit('realtime.ready', { connected: true });
    } catch {
      client.disconnect(true);
    }
  }

  emitNotification(notification: Notification): void {
    this.emitToUser(notification.userId, 'notification.created', notification);
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    this.server.to(this.userRoom(userId)).emit(event, payload);
  }

  emitToUsers(userIds: string[], event: string, payload: unknown): void {
    [...new Set(userIds)].forEach((userId) =>
      this.emitToUser(userId, event, payload),
    );
  }

  private userRoom(userId: string): string {
    return `user:${userId}`;
  }
}
