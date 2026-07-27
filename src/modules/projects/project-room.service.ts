import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { IsNull, LessThan, QueryFailedError, Repository } from 'typeorm';
import {
  JobStatus,
  ProjectChannelType,
  ProjectFileCategory,
  ProjectFileVisibility,
  ProjectLinkType,
  ProjectMeetingStatus,
  ProjectMessageType,
} from '../../shared';
import { NotificationGateway } from '../notifications/notification.gateway';
import { NotificationType } from '../notifications/entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreateChannelMessageDto,
  CreateProjectChannelDto,
  CreateProjectFileDto,
  CreateProjectLinkDto,
  CreateProjectMeetingDto,
  UpdateChannelMessageDto,
  UpdateProjectChannelDto,
  UpdateProjectFileVisibilityDto,
  UpdateProjectMeetingDto,
} from './dto/project-room.dto';
import { ProjectActivity } from './entities/project-activity.entity';
import { ProjectChannelMember } from './entities/project-channel-member.entity';
import { ProjectChannel } from './entities/project-channel.entity';
import { ProjectFile } from './entities/project-file.entity';
import { ProjectLink } from './entities/project-link.entity';
import { ProjectMeeting } from './entities/project-meeting.entity';
import { ProjectMessage } from './entities/project-message.entity';
import { Project } from './entities/project.entity';
import { PROJECT_STORAGE, StorageProvider } from './project-storage.provider';

interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface ProjectRoomView {
  projectId: string;
  channels: Array<
    ProjectChannel & { memberIds: string[]; unreadCount: number }
  >;
  files: ProjectFile[];
  links: ProjectLink[];
  meetings: ProjectMeeting[];
  activity: ProjectActivity[];
}

@Injectable()
export class ProjectRoomService {
  private readonly allowedExtensions: Set<string>;
  private readonly allowedMimeTypes: Set<string>;
  private readonly maxFileSize: number;

  constructor(
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(ProjectChannel)
    private readonly channels: Repository<ProjectChannel>,
    @InjectRepository(ProjectChannelMember)
    private readonly channelMembers: Repository<ProjectChannelMember>,
    @InjectRepository(ProjectMessage)
    private readonly messages: Repository<ProjectMessage>,
    @InjectRepository(ProjectFile)
    private readonly files: Repository<ProjectFile>,
    @InjectRepository(ProjectLink)
    private readonly links: Repository<ProjectLink>,
    @InjectRepository(ProjectMeeting)
    private readonly meetings: Repository<ProjectMeeting>,
    @InjectRepository(ProjectActivity)
    private readonly activities: Repository<ProjectActivity>,
    @Inject(PROJECT_STORAGE) private readonly storage: StorageProvider,
    private readonly config: ConfigService,
    private readonly realtime: NotificationGateway,
    private readonly notifications: NotificationsService,
  ) {
    this.allowedExtensions = new Set(
      this.config
        .get<string>(
          'PROJECT_FILE_EXTENSIONS',
          'pdf,doc,docx,xls,xlsx,csv,txt,zip,png,jpg,jpeg,webp',
        )
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    );
    this.allowedMimeTypes = new Set(
      this.config
        .get<string>(
          'PROJECT_FILE_MIME_TYPES',
          'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain,application/zip,image/png,image/jpeg,image/webp',
        )
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    );
    this.maxFileSize = this.config.get<number>(
      'PROJECT_FILE_MAX_BYTES',
      20 * 1024 * 1024,
    );
  }

  async ensureRoom(project: Project): Promise<void> {
    const now = new Date().toISOString();
    const defaults = [
      {
        type: ProjectChannelType.GENERAL,
        name: 'General',
        clientIncluded: true,
        memberIds: project.participantIds,
      },
      {
        type: ProjectChannelType.TEAM_INTERNAL,
        name: 'Equipo interno',
        clientIncluded: false,
        memberIds: project.solverIds,
      },
    ];
    for (const definition of defaults) {
      let channel = await this.channels.findOneBy({
        projectId: project.id,
        type: definition.type,
      });
      if (!channel) {
        try {
          channel = await this.channels.save(
            this.channels.create({
              id: randomUUID(),
              projectId: project.id,
              name: definition.name,
              type: definition.type,
              createdBy: project.requesterId,
              isDefault: true,
              isArchived: false,
              clientIncluded: definition.clientIncluded,
              createdAt: now,
              updatedAt: now,
            }),
          );
        } catch (error) {
          channel = await this.channels.findOneBy({
            projectId: project.id,
            type: definition.type,
          });
          if (!channel) throw error;
        }
      }
      await this.syncMembers(channel.id, definition.memberIds);
    }
    const created = await this.activities.findOneBy({
      projectId: project.id,
      type: 'PROJECT_ROOM_CREATED',
    });
    if (!created) {
      await this.recordActivity(
        project.id,
        project.requesterId,
        'PROJECT_ROOM_CREATED',
        undefined,
        'project',
        { channelCount: 2 },
      );
    }
  }

  async getByProblem(userId: string, problemId: string): Promise<Project> {
    const project = await this.projects.findOneBy({ problemId });
    if (!project || !project.participantIds.includes(userId))
      throw new NotFoundException('Project room not found');
    return project;
  }

  async getRoom(userId: string, projectId: string): Promise<ProjectRoomView> {
    const project = await this.participating(userId, projectId);
    await this.ensureRoom(project);
    const channels = await this.listChannels(userId, projectId);
    const [files, links, meetings, activity] = await Promise.all([
      this.listFiles(userId, projectId),
      this.listLinks(userId, projectId),
      this.listMeetings(userId, projectId),
      this.listActivity(userId, projectId),
    ]);
    return { projectId, channels, files, links, meetings, activity };
  }

  async listChannels(
    userId: string,
    projectId: string,
  ): Promise<
    Array<ProjectChannel & { memberIds: string[]; unreadCount: number }>
  > {
    const project = await this.participating(userId, projectId);
    const channels = await this.channels.find({
      where: { projectId },
      order: { createdAt: 'ASC' },
    });
    const visible: Array<
      ProjectChannel & { memberIds: string[]; unreadCount: number }
    > = [];
    for (const channel of channels) {
      if (!(await this.canAccessChannel(project, channel, userId))) continue;
      const members = await this.activeChannelMembers(channel.id);
      const membership = members.find((member) => member.userId === userId);
      const messages = await this.messages.find({
        where: { projectId, conversationId: channel.id },
      });
      const unreadCount = messages.filter(
        (message) =>
          message.senderId !== userId &&
          !message.deletedAt &&
          (!membership?.lastReadAt ||
            message.createdAt > membership.lastReadAt),
      ).length;
      visible.push(
        Object.assign(channel, {
          memberIds: members.map((member) => member.userId),
          unreadCount,
        }),
      );
    }
    return visible;
  }

  async createChannel(
    userId: string,
    projectId: string,
    dto: CreateProjectChannelDto,
  ): Promise<ProjectChannel> {
    const project = await this.activeParticipant(userId, projectId);
    this.assertConversationManager(project, userId);
    if (dto.type !== ProjectChannelType.CUSTOM)
      throw new ForbiddenException('Only custom conversations can be created');
    const requested = [...new Set([userId, ...(dto.memberIds ?? [])])];
    if (requested.some((id) => !project.participantIds.includes(id)))
      throw new ForbiddenException(
        'Conversation members must belong to project',
      );
    if (dto.clientIncluded && !requested.includes(project.requesterId))
      requested.push(project.requesterId);
    const now = new Date().toISOString();
    const channel = await this.channels.save(
      this.channels.create({
        id: randomUUID(),
        projectId,
        name: dto.name.trim(),
        type: ProjectChannelType.CUSTOM,
        createdBy: userId,
        isDefault: false,
        isArchived: false,
        clientIncluded: requested.includes(project.requesterId),
        createdAt: now,
        updatedAt: now,
      }),
    );
    await this.syncMembers(channel.id, requested);
    await this.recordActivity(
      projectId,
      userId,
      'CONVERSATION_CREATED',
      channel.id,
      'project',
      {
        name: channel.name,
      },
    );
    this.realtime.emitToUsers(
      requested,
      'project.conversation.created',
      channel,
    );
    return channel;
  }

  async updateChannel(
    userId: string,
    projectId: string,
    channelId: string,
    dto: UpdateProjectChannelDto,
  ): Promise<ProjectChannel> {
    const project = await this.activeParticipant(userId, projectId);
    const channel = await this.channel(project, channelId, userId);
    if (channel.isDefault)
      throw new ForbiddenException('Default conversations cannot be modified');
    const leadId = project.leadSolverId ?? project.solverIds[0];
    if (channel.createdBy !== userId && leadId !== userId)
      throw new ForbiddenException(
        'Only leader or conversation creator can manage it',
      );
    let memberIds = (await this.activeChannelMembers(channel.id)).map(
      (member) => member.userId,
    );
    if (dto.memberIds) {
      memberIds = [...new Set([userId, ...dto.memberIds])];
      if (memberIds.some((id) => !project.participantIds.includes(id)))
        throw new ForbiddenException(
          'Conversation members must belong to project',
        );
    }
    if (dto.clientIncluded === true && !memberIds.includes(project.requesterId))
      memberIds.push(project.requesterId);
    if (dto.clientIncluded === false)
      memberIds = memberIds.filter((id) => id !== project.requesterId);
    await this.syncMembers(channel.id, memberIds);
    this.channels.merge(channel, {
      ...(dto.name ? { name: dto.name.trim() } : {}),
      ...(dto.isArchived === undefined ? {} : { isArchived: dto.isArchived }),
      clientIncluded: memberIds.includes(project.requesterId),
      updatedAt: new Date().toISOString(),
    });
    const saved = await this.channels.save(channel);
    await this.recordActivity(
      projectId,
      userId,
      'CONVERSATION_UPDATED',
      channel.id,
      'project',
      {
        name: saved.name,
        clientIncluded: saved.clientIncluded,
      },
    );
    this.realtime.emitToUsers(memberIds, 'project.conversation.updated', saved);
    return saved;
  }

  async findMessages(
    userId: string,
    projectId: string,
    channelId: string,
    cursor?: string,
    limit = 50,
  ): Promise<{ items: ProjectMessage[]; nextCursor?: string }> {
    const project = await this.participating(userId, projectId);
    await this.channel(project, channelId, userId);
    const pageSize = Math.min(100, Math.max(1, limit));
    const candidates = await this.messages.find({
      where: {
        projectId,
        conversationId: channelId,
        ...(cursor ? { createdAt: LessThan(cursor) } : {}),
      },
      order: { createdAt: 'DESC' },
      take: pageSize + 1,
    });
    const hasMore = candidates.length > pageSize;
    const page = candidates.slice(0, pageSize).reverse();
    return {
      items: page,
      ...(hasMore && page[0] ? { nextCursor: page[0].createdAt } : {}),
    };
  }

  async sendMessage(
    userId: string,
    projectId: string,
    channelId: string,
    dto: CreateChannelMessageDto,
    idempotencyKey: string,
  ): Promise<ProjectMessage> {
    if (!idempotencyKey.trim())
      throw new ConflictException('Idempotency-Key is required');
    const project = await this.activeParticipant(userId, projectId);
    const channel = await this.channel(project, channelId, userId);
    if (channel.isArchived)
      throw new ConflictException('Conversation is archived');
    const existing = await this.messages.findOneBy({
      conversationId: channelId,
      idempotencyKey,
    });
    if (existing) return existing;
    if (dto.parentMessageId) {
      const parent = await this.messages.findOneBy({
        id: dto.parentMessageId,
        conversationId: channelId,
      });
      if (!parent) throw new NotFoundException('Parent message not found');
    }
    const mentionUserIds = [...new Set(dto.mentionUserIds ?? [])];
    const recipients = await this.channelRecipients(project, channel);
    if (mentionUserIds.some((id) => !recipients.includes(id)))
      throw new ForbiddenException('Mentioned user cannot access conversation');
    const fileItems = dto.fileIds?.length
      ? await Promise.all(dto.fileIds.map((id) => this.files.findOneBy({ id })))
      : [];
    const accessibleFiles = await Promise.all(
      fileItems.map((file) =>
        file?.projectId === projectId && !file.deletedAt
          ? this.canAccessFile(project, file, userId)
          : Promise.resolve(false),
      ),
    );
    if (accessibleFiles.some((accessible) => !accessible))
      throw new ForbiddenException('Attached file is unavailable');
    const now = new Date().toISOString();
    let message: ProjectMessage;
    try {
      message = await this.messages.save(
        this.messages.create({
          id: randomUUID(),
          projectId,
          conversationId: channelId,
          senderId: userId,
          type: fileItems.length
            ? fileItems.some(
                (file) => file?.category === ProjectFileCategory.IMAGE,
              )
              ? ProjectMessageType.IMAGE
              : ProjectMessageType.FILE
            : ProjectMessageType.MESSAGE,
          ...(dto.content?.trim() ? { text: dto.content.trim() } : {}),
          ...(dto.parentMessageId
            ? { parentMessageId: dto.parentMessageId }
            : {}),
          attachmentUrls: fileItems.map(
            (file) => `/project-files/${encodeURIComponent(file!.id)}/download`,
          ),
          mentionUserIds,
          reactions: {},
          idempotencyKey,
          createdAt: now,
          updatedAt: now,
        }),
      );
    } catch (error) {
      const code = (
        error as QueryFailedError & { driverError?: { code?: string } }
      ).driverError?.code;
      if (code !== '23505') throw error;
      const concurrent = await this.messages.findOneBy({
        conversationId: channelId,
        idempotencyKey,
      });
      if (!concurrent) throw error;
      return concurrent;
    }
    this.realtime.emitToUsers(
      recipients.filter((id) => id !== userId),
      'project.message.created',
      message,
    );
    if (mentionUserIds.length) {
      await this.notifications.createForUsersSafely(
        mentionUserIds,
        {
          type: NotificationType.PROJECT_MESSAGE,
          title: 'Te mencionaron en un proyecto',
          message:
            dto.content?.trim().slice(0, 160) || 'Revisa el mensaje adjunto.',
          href: `/projects/${projectId}?conversation=${channelId}`,
        },
        userId,
      );
    }
    return message;
  }

  async updateMessage(
    userId: string,
    messageId: string,
    dto: UpdateChannelMessageDto,
  ): Promise<ProjectMessage> {
    const message = await this.messageForAuthor(userId, messageId);
    message.text = dto.content.trim();
    message.editedAt = new Date().toISOString();
    message.updatedAt = message.editedAt;
    const saved = await this.messages.save(message);
    await this.emitMessageEvent(message, 'project.message.updated');
    return saved;
  }

  async deleteMessage(
    userId: string,
    messageId: string,
  ): Promise<ProjectMessage> {
    const message = await this.messageForAuthor(userId, messageId);
    delete message.text;
    message.deletedAt = new Date().toISOString();
    message.updatedAt = message.deletedAt;
    const saved = await this.messages.save(message);
    await this.emitMessageEvent(message, 'project.message.deleted');
    return saved;
  }

  async reactToMessage(
    userId: string,
    messageId: string,
    reaction: string,
  ): Promise<ProjectMessage> {
    const message = await this.messages.findOneBy({ id: messageId });
    if (!message || !message.conversationId)
      throw new NotFoundException('Message not found');
    const project = await this.participating(userId, message.projectId);
    await this.channel(project, message.conversationId, userId);
    const reactions = { ...(message.reactions ?? {}) };
    const users = new Set(reactions[reaction] ?? []);
    users.has(userId) ? users.delete(userId) : users.add(userId);
    reactions[reaction] = [...users];
    message.reactions = reactions;
    message.updatedAt = new Date().toISOString();
    const saved = await this.messages.save(message);
    await this.emitMessageEvent(message, 'project.message.updated');
    return saved;
  }

  async markRead(
    userId: string,
    projectId: string,
    channelId: string,
  ): Promise<void> {
    const project = await this.participating(userId, projectId);
    await this.channel(project, channelId, userId);
    const membership = await this.channelMembers.findOneBy({
      channelId,
      userId,
      removedAt: IsNull(),
    });
    if (membership) {
      membership.lastReadAt = new Date().toISOString();
      await this.channelMembers.save(membership);
    }
  }

  async emitTyping(
    userId: string,
    projectId: string,
    channelId: string,
    typing: boolean,
  ): Promise<void> {
    const project = await this.participating(userId, projectId);
    const channel = await this.channel(project, channelId, userId);
    this.realtime.emitToUsers(
      (await this.channelRecipients(project, channel)).filter(
        (id) => id !== userId,
      ),
      typing ? 'project.message.typing' : 'project.message.stop-typing',
      { projectId, conversationId: channelId, userId },
    );
  }

  async uploadFile(
    userId: string,
    projectId: string,
    dto: CreateProjectFileDto,
    upload: UploadedFile,
  ): Promise<ProjectFile> {
    const project = await this.activeParticipant(userId, projectId);
    if (!upload?.buffer) throw new ConflictException('File is required');
    const extension = extname(upload.originalname).slice(1).toLowerCase();
    if (!this.allowedExtensions.has(extension))
      throw new ConflictException('File extension is not allowed');
    if (!this.allowedMimeTypes.has(upload.mimetype.toLowerCase()))
      throw new ConflictException('File MIME type is not allowed');
    if (upload.size < 1 || upload.size > this.maxFileSize)
      throw new ConflictException('File size exceeds configured limit');
    this.assertFileScope(project, userId, dto.visibility, dto.conversationId);
    if (dto.conversationId)
      await this.channel(project, dto.conversationId, userId);
    const safeName = upload.originalname
      .normalize('NFKC')
      .replace(/[^a-zA-Z0-9._ -]/g, '_')
      .slice(0, 255);
    const stored = await this.storage.upload(
      projectId,
      extension,
      upload.buffer,
    );
    const now = new Date().toISOString();
    const file = await this.files.save(
      this.files.create({
        id: randomUUID(),
        projectId,
        ...(dto.conversationId ? { conversationId: dto.conversationId } : {}),
        uploadedBy: userId,
        originalName: safeName,
        storedName: stored.storedName,
        mimeType: upload.mimetype.toLowerCase(),
        extension,
        size: String(upload.size),
        storageKey: stored.storageKey,
        category: dto.category,
        visibility: dto.visibility,
        createdAt: now,
        updatedAt: now,
      }),
    );
    await this.recordActivity(
      projectId,
      userId,
      'FILE_UPLOADED',
      file.id,
      this.activityVisibility(dto.visibility),
      { name: safeName, category: dto.category },
      dto.conversationId,
    );
    this.realtime.emitToUsers(
      await this.resourceRecipients(
        project,
        dto.visibility,
        dto.conversationId,
      ),
      'project.file.uploaded',
      file,
    );
    return file;
  }

  async listFiles(userId: string, projectId: string): Promise<ProjectFile[]> {
    const project = await this.participating(userId, projectId);
    const files = await this.files.find({
      where: { projectId },
      order: { createdAt: 'DESC' },
    });
    const visible: ProjectFile[] = [];
    for (const file of files) {
      if (!file.deletedAt && (await this.canAccessFile(project, file, userId)))
        visible.push(file);
    }
    return visible;
  }

  async downloadFile(
    userId: string,
    fileId: string,
  ): Promise<{ file: ProjectFile; content: Buffer }> {
    const file = await this.files.findOneBy({ id: fileId });
    if (!file || file.deletedAt) throw new NotFoundException('File not found');
    const project = await this.participating(userId, file.projectId);
    if (!(await this.canAccessFile(project, file, userId)))
      throw new ForbiddenException('File is not visible to user');
    if (!(await this.storage.exists(file.storageKey)))
      throw new NotFoundException('Stored file not found');
    return { file, content: await this.storage.download(file.storageKey) };
  }

  async updateFileVisibility(
    userId: string,
    fileId: string,
    dto: UpdateProjectFileVisibilityDto,
  ): Promise<ProjectFile> {
    const file = await this.files.findOneBy({ id: fileId });
    if (!file || file.deletedAt) throw new NotFoundException('File not found');
    const project = await this.participating(userId, file.projectId);
    const leadId = project.leadSolverId ?? project.solverIds[0];
    if (![file.uploadedBy, project.requesterId, leadId].includes(userId))
      throw new ForbiddenException('User cannot change file visibility');
    this.assertFileScope(project, userId, dto.visibility, dto.conversationId);
    if (dto.conversationId)
      await this.channel(project, dto.conversationId, userId);
    file.visibility = dto.visibility;
    file.conversationId = dto.conversationId ?? null;
    file.updatedAt = new Date().toISOString();
    return this.files.save(file);
  }

  async deleteFile(userId: string, fileId: string): Promise<ProjectFile> {
    const file = await this.files.findOneBy({ id: fileId });
    if (!file || file.deletedAt) throw new NotFoundException('File not found');
    const project = await this.participating(userId, file.projectId);
    const leadId = project.leadSolverId ?? project.solverIds[0];
    if (![file.uploadedBy, project.requesterId, leadId].includes(userId))
      throw new ForbiddenException('User cannot delete file');
    file.deletedAt = new Date().toISOString();
    file.updatedAt = file.deletedAt;
    await this.files.save(file);
    await this.storage.delete(file.storageKey);
    await this.recordActivity(
      project.id,
      userId,
      'FILE_DELETED',
      file.id,
      this.activityVisibility(file.visibility),
      { name: file.originalName },
      file.conversationId ?? undefined,
    );
    return file;
  }

  async createLink(
    userId: string,
    projectId: string,
    dto: CreateProjectLinkDto,
  ): Promise<ProjectLink> {
    const project = await this.activeParticipant(userId, projectId);
    this.assertFileScope(project, userId, dto.visibility, dto.conversationId);
    if (dto.conversationId)
      await this.channel(project, dto.conversationId, userId);
    const parsed = new URL(dto.url);
    const inferredType =
      parsed.hostname === 'github.com'
        ? ProjectLinkType.GITHUB
        : parsed.hostname === 'gitlab.com'
          ? ProjectLinkType.GITLAB
          : dto.type;
    const now = new Date().toISOString();
    const link = await this.links.save(
      this.links.create({
        id: randomUUID(),
        projectId,
        ...(dto.conversationId ? { conversationId: dto.conversationId } : {}),
        createdBy: userId,
        type: inferredType,
        url: dto.url,
        title: dto.title.trim(),
        ...(dto.description?.trim()
          ? { description: dto.description.trim() }
          : {}),
        ...(dto.repositoryName?.trim()
          ? { repositoryName: dto.repositoryName.trim() }
          : {}),
        ...(dto.defaultBranch?.trim()
          ? { defaultBranch: dto.defaultBranch.trim() }
          : {}),
        ...(dto.modulePath?.trim()
          ? { modulePath: dto.modulePath.trim() }
          : {}),
        visibility: dto.visibility,
        createdAt: now,
        updatedAt: now,
      }),
    );
    await this.recordActivity(
      projectId,
      userId,
      'LINK_ADDED',
      link.id,
      this.activityVisibility(dto.visibility),
      { title: link.title, type: link.type, domain: parsed.hostname },
      dto.conversationId,
    );
    this.realtime.emitToUsers(
      await this.resourceRecipients(
        project,
        dto.visibility,
        dto.conversationId,
      ),
      'project.link.added',
      link,
    );
    return link;
  }

  async listLinks(userId: string, projectId: string): Promise<ProjectLink[]> {
    const project = await this.participating(userId, projectId);
    const links = await this.links.find({
      where: { projectId },
      order: { createdAt: 'DESC' },
    });
    const visible: ProjectLink[] = [];
    for (const link of links) {
      if (
        await this.canAccessScoped(
          project,
          userId,
          link.visibility,
          link.conversationId,
        )
      )
        visible.push(link);
    }
    return visible;
  }

  async deleteLink(userId: string, linkId: string): Promise<void> {
    const link = await this.links.findOneBy({ id: linkId });
    if (!link) throw new NotFoundException('Link not found');
    const project = await this.participating(userId, link.projectId);
    const leadId = project.leadSolverId ?? project.solverIds[0];
    if (![link.createdBy, project.requesterId, leadId].includes(userId))
      throw new ForbiddenException('User cannot delete link');
    await this.links.delete({ id: linkId });
  }

  async createMeeting(
    userId: string,
    projectId: string,
    dto: CreateProjectMeetingDto,
  ): Promise<ProjectMeeting> {
    const project = await this.activeParticipant(userId, projectId);
    this.assertMeetingManager(project, userId);
    await this.validateMeeting(project, userId, dto);
    const now = new Date().toISOString();
    const meeting = await this.meetings.save(
      this.meetings.create({
        id: randomUUID(),
        projectId,
        ...(dto.conversationId ? { conversationId: dto.conversationId } : {}),
        createdBy: userId,
        title: dto.title.trim(),
        ...(dto.description?.trim()
          ? { description: dto.description.trim() }
          : {}),
        type: dto.type,
        status: ProjectMeetingStatus.SCHEDULED,
        startAt: dto.startAt,
        endAt: dto.endAt,
        timezone: dto.timezone.trim(),
        ...(dto.meetingUrl ? { meetingUrl: dto.meetingUrl } : {}),
        reminderMinutes: dto.reminderMinutes ?? 30,
        ...(dto.notes?.trim() ? { notes: dto.notes.trim() } : {}),
        participantIds: [...new Set(dto.participantIds)],
        visibility: dto.visibility,
        createdAt: now,
        updatedAt: now,
      }),
    );
    const recipients = await this.resourceRecipients(
      project,
      dto.visibility,
      dto.conversationId,
    );
    await this.recordActivity(
      projectId,
      userId,
      'MEETING_CREATED',
      meeting.id,
      this.activityVisibility(dto.visibility),
      { title: meeting.title, startAt: meeting.startAt },
      dto.conversationId,
    );
    await this.systemMessage(
      project,
      dto.conversationId,
      userId,
      `Se programó la reunión “${meeting.title}” para ${meeting.startAt}.`,
      ProjectMessageType.MEETING,
    );
    await this.notifications.createForUsersSafely(
      recipients,
      {
        type: NotificationType.PROJECT_MESSAGE,
        title: 'Reunión programada',
        message: `${meeting.title} · ${meeting.startAt}`,
        href: `/projects/${projectId}`,
      },
      userId,
    );
    this.realtime.emitToUsers(recipients, 'project.meeting.created', meeting);
    return meeting;
  }

  async updateMeeting(
    userId: string,
    projectId: string,
    meetingId: string,
    dto: UpdateProjectMeetingDto,
  ): Promise<ProjectMeeting> {
    const project = await this.activeParticipant(userId, projectId);
    this.assertMeetingManager(project, userId);
    const meeting = await this.meetings.findOneBy({ id: meetingId, projectId });
    if (!meeting) throw new NotFoundException('Meeting not found');
    await this.validateMeeting(project, userId, {
      title: dto.title ?? meeting.title,
      description: dto.description ?? meeting.description ?? undefined,
      type: dto.type ?? meeting.type,
      startAt: dto.startAt ?? meeting.startAt,
      endAt: dto.endAt ?? meeting.endAt,
      timezone: dto.timezone ?? meeting.timezone,
      meetingUrl: dto.meetingUrl ?? meeting.meetingUrl ?? undefined,
      reminderMinutes: dto.reminderMinutes ?? meeting.reminderMinutes,
      notes: dto.notes ?? meeting.notes ?? undefined,
      participantIds: dto.participantIds ?? meeting.participantIds,
      visibility: dto.visibility ?? meeting.visibility,
      conversationId: dto.conversationId ?? meeting.conversationId ?? undefined,
    });
    this.meetings.merge(meeting, {
      ...dto,
      ...(dto.title ? { title: dto.title.trim() } : {}),
      ...(dto.timezone ? { timezone: dto.timezone.trim() } : {}),
      updatedAt: new Date().toISOString(),
    });
    const saved = await this.meetings.save(meeting);
    const event =
      saved.status === ProjectMeetingStatus.CANCELLED
        ? 'project.meeting.cancelled'
        : 'project.meeting.updated';
    const type =
      saved.status === ProjectMeetingStatus.CANCELLED
        ? 'MEETING_CANCELLED'
        : 'MEETING_UPDATED';
    await this.recordActivity(
      projectId,
      userId,
      type,
      saved.id,
      this.activityVisibility(saved.visibility),
      { title: saved.title, startAt: saved.startAt },
      saved.conversationId ?? undefined,
    );
    this.realtime.emitToUsers(
      await this.resourceRecipients(
        project,
        saved.visibility,
        saved.conversationId,
      ),
      event,
      saved,
    );
    return saved;
  }

  async listMeetings(
    userId: string,
    projectId: string,
  ): Promise<ProjectMeeting[]> {
    const project = await this.participating(userId, projectId);
    const meetings = await this.meetings.find({
      where: { projectId },
      order: { startAt: 'ASC' },
    });
    const visible: ProjectMeeting[] = [];
    for (const meeting of meetings) {
      if (
        await this.canAccessScoped(
          project,
          userId,
          meeting.visibility,
          meeting.conversationId,
        )
      )
        visible.push(meeting);
    }
    return visible;
  }

  async listActivity(
    userId: string,
    projectId: string,
  ): Promise<ProjectActivity[]> {
    const project = await this.participating(userId, projectId);
    const activity = await this.activities.find({
      where: { projectId },
      order: { createdAt: 'DESC' },
    });
    const visible: ProjectActivity[] = [];
    for (const item of activity) {
      if (item.visibility === 'team_only' && userId === project.requesterId)
        continue;
      if (item.visibility === 'conversation' && item.conversationId) {
        const channel = await this.channels.findOneBy({
          id: item.conversationId,
          projectId,
        });
        if (
          !channel ||
          !(await this.canAccessChannel(project, channel, userId))
        )
          continue;
      }
      visible.push(item);
    }
    return visible;
  }

  async participantAdded(
    project: Project,
    actorId: string,
    participantId: string,
  ): Promise<void> {
    await this.ensureRoom(project);
    const general = await this.channels.findOneBy({
      projectId: project.id,
      type: ProjectChannelType.GENERAL,
    });
    const internal = await this.channels.findOneBy({
      projectId: project.id,
      type: ProjectChannelType.TEAM_INTERNAL,
    });
    if (general) await this.syncMembers(general.id, project.participantIds);
    if (internal) await this.syncMembers(internal.id, project.solverIds);
    await this.recordActivity(
      project.id,
      actorId,
      'MEMBER_ADDED',
      participantId,
      'project',
    );
  }

  async participantRemoved(
    project: Project,
    actorId: string,
    participantId: string,
  ): Promise<void> {
    const channels = await this.channels.find({
      where: { projectId: project.id },
    });
    for (const channel of channels) {
      const membership = await this.channelMembers.findOneBy({
        channelId: channel.id,
        userId: participantId,
        removedAt: IsNull(),
      });
      if (membership) {
        membership.removedAt = new Date().toISOString();
        await this.channelMembers.save(membership);
      }
    }
    await this.recordActivity(
      project.id,
      actorId,
      'MEMBER_REMOVED',
      participantId,
      'project',
    );
  }

  private async validateMeeting(
    project: Project,
    userId: string,
    dto: CreateProjectMeetingDto,
  ): Promise<void> {
    if (Date.parse(dto.endAt) <= Date.parse(dto.startAt))
      throw new ConflictException('Meeting end must be after start');
    if (dto.participantIds.some((id) => !project.participantIds.includes(id)))
      throw new ForbiddenException(
        'Meeting participants must belong to project',
      );
    this.assertFileScope(project, userId, dto.visibility, dto.conversationId);
    if (dto.conversationId)
      await this.channel(project, dto.conversationId, userId);
  }

  private assertConversationManager(project: Project, userId: string): void {
    const leadId = project.leadSolverId ?? project.solverIds[0];
    if (![project.requesterId, leadId].includes(userId))
      throw new ForbiddenException(
        'Only client or leader can manage conversations',
      );
  }

  private assertMeetingManager(project: Project, userId: string): void {
    const leadId = project.leadSolverId ?? project.solverIds[0];
    if (![project.requesterId, leadId].includes(userId))
      throw new ForbiddenException('Only client or leader can manage meetings');
  }

  private assertFileScope(
    project: Project,
    userId: string,
    visibility: ProjectFileVisibility,
    conversationId?: string,
  ): void {
    if (
      visibility === ProjectFileVisibility.TEAM_ONLY &&
      userId === project.requesterId
    )
      throw new ForbiddenException('Client cannot create team-only resources');
    if (visibility === ProjectFileVisibility.CONVERSATION && !conversationId)
      throw new ConflictException(
        'Conversation visibility requires conversationId',
      );
  }

  private async canAccessFile(
    project: Project,
    file: ProjectFile,
    userId: string,
  ): Promise<boolean> {
    return this.canAccessScoped(
      project,
      userId,
      file.visibility,
      file.conversationId,
    );
  }

  private async canAccessScoped(
    project: Project,
    userId: string,
    visibility: ProjectFileVisibility,
    conversationId?: string | null,
  ): Promise<boolean> {
    if (!project.participantIds.includes(userId)) return false;
    if (visibility === ProjectFileVisibility.TEAM_ONLY)
      return project.solverIds.includes(userId);
    if (visibility === ProjectFileVisibility.CONVERSATION) {
      if (!conversationId) return false;
      const channel = await this.channels.findOneBy({
        id: conversationId,
        projectId: project.id,
      });
      return Boolean(
        channel && (await this.canAccessChannel(project, channel, userId)),
      );
    }
    return true;
  }

  private async resourceRecipients(
    project: Project,
    visibility: ProjectFileVisibility,
    conversationId?: string | null,
  ): Promise<string[]> {
    if (visibility === ProjectFileVisibility.TEAM_ONLY)
      return project.solverIds;
    if (visibility === ProjectFileVisibility.CONVERSATION && conversationId) {
      const channel = await this.channels.findOneBy({
        id: conversationId,
        projectId: project.id,
      });
      return channel ? this.channelRecipients(project, channel) : [];
    }
    return project.participantIds;
  }

  private activityVisibility(
    visibility: ProjectFileVisibility,
  ): 'project' | 'team_only' | 'conversation' {
    if (visibility === ProjectFileVisibility.TEAM_ONLY) return 'team_only';
    if (visibility === ProjectFileVisibility.CONVERSATION)
      return 'conversation';
    return 'project';
  }

  private async systemMessage(
    project: Project,
    conversationId: string | undefined,
    senderId: string,
    text: string,
    type: ProjectMessageType,
  ): Promise<void> {
    const channel = conversationId
      ? await this.channels.findOneBy({
          id: conversationId,
          projectId: project.id,
        })
      : await this.channels.findOneBy({
          projectId: project.id,
          type: ProjectChannelType.GENERAL,
        });
    if (!channel) return;
    const now = new Date().toISOString();
    const message = await this.messages.save(
      this.messages.create({
        id: randomUUID(),
        projectId: project.id,
        conversationId: channel.id,
        senderId,
        type,
        text,
        attachmentUrls: [],
        mentionUserIds: [],
        reactions: {},
        createdAt: now,
        updatedAt: now,
      }),
    );
    this.realtime.emitToUsers(
      await this.channelRecipients(project, channel),
      'project.message.created',
      message,
    );
  }

  private async emitMessageEvent(
    message: ProjectMessage,
    event: string,
  ): Promise<void> {
    if (!message.conversationId) return;
    const project = await this.projects.findOneBy({ id: message.projectId });
    const channel = await this.channels.findOneBy({
      id: message.conversationId,
    });
    if (!project || !channel) return;
    this.realtime.emitToUsers(
      await this.channelRecipients(project, channel),
      event,
      message,
    );
  }

  private async messageForAuthor(
    userId: string,
    messageId: string,
  ): Promise<ProjectMessage> {
    const message = await this.messages.findOneBy({ id: messageId });
    if (!message || message.deletedAt)
      throw new NotFoundException('Message not found');
    await this.participating(userId, message.projectId);
    if (message.senderId !== userId)
      throw new ForbiddenException('Only message author can modify it');
    return message;
  }

  private async channel(
    project: Project,
    channelId: string,
    userId: string,
  ): Promise<ProjectChannel> {
    const channel = await this.channels.findOneBy({
      id: channelId,
      projectId: project.id,
    });
    if (!channel || !(await this.canAccessChannel(project, channel, userId)))
      throw new NotFoundException('Conversation not found');
    return channel;
  }

  private async canAccessChannel(
    project: Project,
    channel: ProjectChannel,
    userId: string,
  ): Promise<boolean> {
    if (!project.participantIds.includes(userId)) return false;
    if (channel.type === ProjectChannelType.GENERAL) return true;
    if (channel.type === ProjectChannelType.TEAM_INTERNAL)
      return project.solverIds.includes(userId);
    const membership = await this.channelMembers.findOneBy({
      channelId: channel.id,
      userId,
      removedAt: IsNull(),
    });
    return Boolean(membership);
  }

  private async channelRecipients(
    project: Project,
    channel: ProjectChannel,
  ): Promise<string[]> {
    if (channel.type === ProjectChannelType.GENERAL)
      return project.participantIds;
    if (channel.type === ProjectChannelType.TEAM_INTERNAL)
      return project.solverIds;
    const members = await this.activeChannelMembers(channel.id);
    return members
      .map((member) => member.userId)
      .filter((id) => project.participantIds.includes(id));
  }

  private activeChannelMembers(
    channelId: string,
  ): Promise<ProjectChannelMember[]> {
    return this.channelMembers.find({
      where: { channelId, removedAt: IsNull() },
    });
  }

  private async syncMembers(
    channelId: string,
    memberIds: string[],
  ): Promise<void> {
    const desired = new Set(memberIds);
    const existing = await this.channelMembers.find({ where: { channelId } });
    const now = new Date().toISOString();
    for (const member of existing) {
      if (desired.has(member.userId)) {
        if (member.removedAt) {
          member.removedAt = null;
          member.joinedAt = now;
          await this.channelMembers.save(member);
        }
        desired.delete(member.userId);
      } else if (!member.removedAt) {
        member.removedAt = now;
        await this.channelMembers.save(member);
      }
    }
    if (desired.size) {
      await this.channelMembers.save(
        [...desired].map((userId) =>
          this.channelMembers.create({
            id: randomUUID(),
            channelId,
            userId,
            joinedAt: now,
          }),
        ),
      );
    }
  }

  private async recordActivity(
    projectId: string,
    actorId: string | undefined,
    type: string,
    entityId?: string,
    visibility: 'project' | 'team_only' | 'conversation' = 'project',
    metadata: Record<string, unknown> = {},
    conversationId?: string,
  ): Promise<ProjectActivity> {
    return this.activities.save(
      this.activities.create({
        id: randomUUID(),
        projectId,
        ...(conversationId ? { conversationId } : {}),
        ...(actorId ? { actorId } : {}),
        type,
        ...(entityId ? { entityId } : {}),
        visibility,
        metadata,
        createdAt: new Date().toISOString(),
      }),
    );
  }

  private async activeParticipant(
    userId: string,
    projectId: string,
  ): Promise<Project> {
    const project = await this.participating(userId, projectId);
    if (project.status !== JobStatus.ACTIVE)
      throw new ConflictException('Project room is read-only');
    return project;
  }

  private async participating(
    userId: string,
    projectId: string,
  ): Promise<Project> {
    const project = await this.projects.findOneBy({ id: projectId });
    if (!project) throw new NotFoundException('Project not found');
    if (!project.participantIds.includes(userId))
      throw new ForbiddenException('User is not an active project participant');
    return project;
  }
}
