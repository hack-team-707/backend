import { OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import { AuthSessionService } from '../../auth/auth-session.service';
import { SessionDisconnectService } from '../../auth/session-disconnect.service';
import { TokenRevocationService } from '../../auth/token-revocation.service';
import { Notification } from './entities/notification.entity';

interface SocketTicket {
  sub?: string;
  sid?: string;
  jti?: string;
  exp?: number;
  type?: 'socket';
  purpose?: 'socket';
}

function socketOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  const allowed = (process.env.CORS_ORIGINS ?? 'http://localhost:3001')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return allowed.includes(origin);
}

@WebSocketGateway({
  namespace: '/realtime',
  cors: {
    credentials: true,
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allowed?: boolean) => void,
    ) =>
      socketOriginAllowed(origin)
        ? callback(null, true)
        : callback(new Error('Origin not allowed')),
  },
})
export class NotificationGateway
  implements OnGatewayConnection, OnGatewayInit, OnModuleDestroy
{
  @WebSocketServer()
  private readonly server!: Namespace;

  private readonly issuer: string;
  private readonly audience: string;
  private readonly legacyAllowed: boolean;
  private unregisterDisconnect?: () => void;

  constructor(
    private readonly jwtService: JwtService,
    private readonly sessions: AuthSessionService,
    private readonly revocations: TokenRevocationService,
    private readonly disconnects: SessionDisconnectService,
    config: ConfigService,
  ) {
    this.issuer = config.get<string>('JWT_ISSUER', 'resolve-platform');
    this.audience = config.get<string>('JWT_AUDIENCE', 'resolve-platform-web');
    this.legacyAllowed = config.get<boolean>('LEGACY_JWT_ALLOWED', true);
  }

  afterInit(): void {
    this.unregisterDisconnect = this.disconnects.register((sessionId) =>
      this.disconnectSession(sessionId),
    );
  }

  onModuleDestroy(): void {
    this.unregisterDisconnect?.();
  }

  async handleConnection(@ConnectedSocket() client: Socket): Promise<void> {
    try {
      const ticket = client.handshake.auth?.ticket;
      if (typeof ticket !== 'string') throw new Error('Missing socket ticket');
      const payload = await this.jwtService.verifyAsync<SocketTicket>(ticket, {
        algorithms: ['HS256'],
        issuer: this.issuer,
        audience: this.audience,
      });
      if (
        payload.type !== 'socket' ||
        payload.purpose !== 'socket' ||
        !payload.sub ||
        !payload.jti ||
        !payload.exp ||
        !(await this.revocations.consumeSocketTicket(payload.jti, payload.exp))
      ) {
        throw new Error('Invalid socket ticket');
      }
      if (payload.sid) {
        const session = await this.sessions.validateSession(payload.sid);
        if (!session || session.userId !== payload.sub)
          throw new Error('Invalid socket session');
        client.data.sessionId = payload.sid;
        await client.join(this.sessionRoom(payload.sid));
      } else if (!this.legacyAllowed) {
        throw new Error('Session-bound socket ticket required');
      }
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

  disconnectSession(sessionId: string): void {
    this.server.in(this.sessionRoom(sessionId)).disconnectSockets(true);
  }

  private userRoom(userId: string): string {
    return `user:${userId}`;
  }

  private sessionRoom(sessionId: string): string {
    return `session:${sessionId}`;
  }
}
