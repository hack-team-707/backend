import { ConfigService } from '@nestjs/config';
import type { ObjectLiteral, Repository } from 'typeorm';
import {
  JobStatus,
  ProjectChannelType,
  ProjectFileVisibility,
  ProjectMessageType,
} from '../../shared';
import { NotificationGateway } from '../notifications/notification.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { ProjectActivity } from './entities/project-activity.entity';
import { ProjectChannelMember } from './entities/project-channel-member.entity';
import { ProjectChannel } from './entities/project-channel.entity';
import { ProjectFile } from './entities/project-file.entity';
import { ProjectLink } from './entities/project-link.entity';
import { ProjectMeeting } from './entities/project-meeting.entity';
import { ProjectMessage } from './entities/project-message.entity';
import { Project } from './entities/project.entity';
import { ProjectRoomService } from './project-room.service';
import type { StorageProvider } from './project-storage.provider';

function repository<T extends ObjectLiteral>() {
  return {
    findOneBy: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn(async (value: T) => value),
    create: jest.fn((value: T) => value),
    merge: jest.fn((target: T, source: Partial<T>) =>
      Object.assign(target, source),
    ),
    delete: jest.fn(),
  } as unknown as Repository<T>;
}

const requesterId = '10000000-0000-4000-8000-000000000001';
const solverId = '10000000-0000-4000-8000-000000000002';
const projectId = '10000000-0000-4000-8000-000000000003';
const generalId = '10000000-0000-4000-8000-000000000004';
const internalId = '10000000-0000-4000-8000-000000000005';

const project = {
  id: projectId,
  requesterId,
  solverIds: [solverId],
  participantIds: [requesterId, solverId],
  leadSolverId: solverId,
  status: JobStatus.ACTIVE,
} as Project;

function channel(id: string, type: ProjectChannelType): ProjectChannel {
  return {
    id,
    projectId,
    name: type === ProjectChannelType.GENERAL ? 'General' : 'Equipo interno',
    type,
    createdBy: requesterId,
    isDefault: true,
    isArchived: false,
    clientIncluded: type === ProjectChannelType.GENERAL,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('ProjectRoomService', () => {
  let projects: Repository<Project>;
  let channels: Repository<ProjectChannel>;
  let members: Repository<ProjectChannelMember>;
  let messages: Repository<ProjectMessage>;
  let files: Repository<ProjectFile>;
  let links: Repository<ProjectLink>;
  let meetings: Repository<ProjectMeeting>;
  let activities: Repository<ProjectActivity>;
  let realtime: { emitToUsers: jest.Mock };
  let service: ProjectRoomService;

  beforeEach(() => {
    projects = repository<Project>();
    channels = repository<ProjectChannel>();
    members = repository<ProjectChannelMember>();
    messages = repository<ProjectMessage>();
    files = repository<ProjectFile>();
    links = repository<ProjectLink>();
    meetings = repository<ProjectMeeting>();
    activities = repository<ProjectActivity>();
    realtime = { emitToUsers: jest.fn() };
    (projects.findOneBy as jest.Mock).mockResolvedValue(project);
    service = new ProjectRoomService(
      projects,
      channels,
      members,
      messages,
      files,
      links,
      meetings,
      activities,
      {
        upload: jest.fn(),
        download: jest.fn(),
        delete: jest.fn(),
        getSignedUrl: jest.fn(),
        exists: jest.fn(),
      } as unknown as StorageProvider,
      {
        get: jest.fn((_key: string, fallback: unknown) => fallback),
      } as unknown as ConfigService,
      realtime as unknown as NotificationGateway,
      {
        createForUsersSafely: jest.fn(),
      } as unknown as NotificationsService,
    );
  });

  it('keeps mandatory channels and room activity idempotent on retries', async () => {
    const general = channel(generalId, ProjectChannelType.GENERAL);
    const internal = channel(internalId, ProjectChannelType.TEAM_INTERNAL);
    (channels.findOneBy as jest.Mock).mockImplementation(
      ({ type }: { type: ProjectChannelType }) =>
        Promise.resolve(
          type === ProjectChannelType.GENERAL ? general : internal,
        ),
    );
    (members.find as jest.Mock).mockImplementation(
      ({ where }: { where: { channelId: string } }) =>
        Promise.resolve(
          (where.channelId === generalId
            ? [requesterId, solverId]
            : [solverId]
          ).map((userId) => ({
            id: `${where.channelId}-${userId}`,
            channelId: where.channelId,
            userId,
            joinedAt: '2026-01-01T00:00:00.000Z',
          })),
        ),
    );
    (activities.findOneBy as jest.Mock).mockResolvedValue({
      id: 'room-created',
    });

    await service.ensureRoom(project);
    await service.ensureRoom(project);

    expect(channels.save).not.toHaveBeenCalled();
    expect(members.save).not.toHaveBeenCalled();
    expect(activities.save).not.toHaveBeenCalled();
  });

  it('never discloses the internal channel to the requester', async () => {
    (channels.find as jest.Mock).mockResolvedValue([
      channel(generalId, ProjectChannelType.GENERAL),
      channel(internalId, ProjectChannelType.TEAM_INTERNAL),
    ]);
    (members.find as jest.Mock).mockResolvedValue([
      {
        id: 'member',
        channelId: generalId,
        userId: requesterId,
        joinedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    (messages.find as jest.Mock).mockResolvedValue([]);

    const visible = await service.listChannels(requesterId, projectId);

    expect(visible.map((item) => item.type)).toEqual([
      ProjectChannelType.GENERAL,
    ]);
    expect(members.find).toHaveBeenCalledTimes(1);
  });

  it('returns the persisted message for a sequential idempotent retry', async () => {
    const persisted = {
      id: 'message-id',
      projectId,
      conversationId: generalId,
      senderId: requesterId,
      type: ProjectMessageType.MESSAGE,
      text: 'Hola',
      attachmentUrls: [],
      mentionUserIds: [],
      reactions: {},
      idempotencyKey: 'retry-key',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as ProjectMessage;
    (channels.findOneBy as jest.Mock).mockResolvedValue(
      channel(generalId, ProjectChannelType.GENERAL),
    );
    (messages.findOneBy as jest.Mock).mockResolvedValue(persisted);

    const result = await service.sendMessage(
      requesterId,
      projectId,
      generalId,
      { content: 'Hola' },
      'retry-key',
    );

    expect(result).toBe(persisted);
    expect(messages.save).not.toHaveBeenCalled();
    expect(realtime.emitToUsers).not.toHaveBeenCalled();
  });

  it('recovers the winning message after a concurrent unique-key conflict', async () => {
    const persisted = {
      id: 'winning-message',
      projectId,
      conversationId: generalId,
      senderId: requesterId,
      type: ProjectMessageType.MESSAGE,
      attachmentUrls: [],
      mentionUserIds: [],
      reactions: {},
      idempotencyKey: 'concurrent-key',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as ProjectMessage;
    (channels.findOneBy as jest.Mock).mockResolvedValue(
      channel(generalId, ProjectChannelType.GENERAL),
    );
    (messages.findOneBy as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(persisted);
    (messages.save as jest.Mock).mockRejectedValue({
      driverError: { code: '23505' },
    });

    const result = await service.sendMessage(
      requesterId,
      projectId,
      generalId,
      { content: 'Una sola vez' },
      'concurrent-key',
    );

    expect(result).toBe(persisted);
    expect(realtime.emitToUsers).not.toHaveBeenCalled();
  });

  it('filters team-only activity from the requester', async () => {
    (activities.find as jest.Mock).mockResolvedValue([
      {
        id: 'public-activity',
        projectId,
        type: 'LINK_ADDED',
        visibility: 'project',
        metadata: {},
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'private-activity',
        projectId,
        type: 'FILE_UPLOADED',
        visibility: 'team_only',
        metadata: { name: 'private.txt' },
        createdAt: '2026-01-01T00:01:00.000Z',
      },
    ] as ProjectActivity[]);

    const visible = await service.listActivity(requesterId, projectId);

    expect(visible.map((item) => item.id)).toEqual(['public-activity']);
    expect(JSON.stringify(visible)).not.toContain('private.txt');
  });

  it('rejects requester-created team-only resources', async () => {
    await expect(
      service.createLink(requesterId, projectId, {
        type: 'general' as never,
        url: 'https://example.com/resource',
        title: 'Privado',
        visibility: ProjectFileVisibility.TEAM_ONLY,
      }),
    ).rejects.toThrow('Client cannot create team-only resources');
  });
});
