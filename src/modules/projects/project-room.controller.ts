import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
  Roles,
} from '../../common/auth.decorators';
import { ProjectMeetingStatus, UserRole } from '../../shared';
import {
  CreateChannelMessageDto,
  CreateProjectChannelDto,
  CreateProjectFileDto,
  CreateProjectLinkDto,
  CreateProjectMeetingDto,
  ReactToMessageDto,
  UpdateChannelMessageDto,
  UpdateProjectChannelDto,
  UpdateProjectFileVisibilityDto,
  UpdateProjectMeetingDto,
} from './dto/project-room.dto';
import { ProjectRoomService } from './project-room.service';

interface MultipartFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@ApiTags('project-room')
@ApiBearerAuth()
@Roles(UserRole.REQUESTER, UserRole.SOLVER, UserRole.ADMIN)
@Controller('projects')
export class ProjectRoomController {
  constructor(private readonly room: ProjectRoomService) {}

  @Get('problem/:problemId/room')
  findByProblem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('problemId') problemId: string,
  ) {
    return this.room.getByProblem(user.userId, problemId);
  }

  @Get(':id/room')
  getRoom(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.room.getRoom(user.userId, id);
  }

  @Get(':id/conversations')
  listChannels(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.room.listChannels(user.userId, id);
  }

  @Post(':id/conversations')
  createChannel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateProjectChannelDto,
  ) {
    return this.room.createChannel(user.userId, id, dto);
  }

  @Patch(':id/conversations/:conversationId')
  updateChannel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('conversationId') conversationId: string,
    @Body() dto: UpdateProjectChannelDto,
  ) {
    return this.room.updateChannel(user.userId, id, conversationId, dto);
  }

  @Get(':id/conversations/:conversationId/messages')
  findMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('conversationId') conversationId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.room.findMessages(
      user.userId,
      id,
      conversationId,
      cursor,
      limit ? Number(limit) : 50,
    );
  }

  @Post(':id/conversations/:conversationId/messages')
  sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('conversationId') conversationId: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() dto: CreateChannelMessageDto,
  ) {
    return this.room.sendMessage(
      user.userId,
      id,
      conversationId,
      dto,
      idempotencyKey ?? '',
    );
  }

  @Patch(':id/messages/:messageId')
  updateMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('messageId') messageId: string,
    @Body() dto: UpdateChannelMessageDto,
  ) {
    return this.room.updateMessage(user.userId, messageId, dto);
  }

  @Delete(':id/messages/:messageId')
  deleteMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('messageId') messageId: string,
  ) {
    return this.room.deleteMessage(user.userId, messageId);
  }

  @Post(':id/messages/:messageId/reactions')
  reactToMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('messageId') messageId: string,
    @Body() dto: ReactToMessageDto,
  ) {
    return this.room.reactToMessage(user.userId, messageId, dto.reaction);
  }

  @Post(':id/conversations/:conversationId/read')
  async markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('conversationId') conversationId: string,
  ) {
    await this.room.markRead(user.userId, id, conversationId);
    return { read: true };
  }

  @Post(':id/conversations/:conversationId/typing')
  async typing(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('conversationId') conversationId: string,
    @Body('typing') typing: boolean,
  ) {
    await this.room.emitTyping(user.userId, id, conversationId, typing);
    return { typing };
  }

  @Get(':id/files')
  listFiles(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.room.listFiles(user.userId, id);
  }

  @Post(':id/files')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  uploadFile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateProjectFileDto,
    @UploadedFile() file: MultipartFile,
  ) {
    return this.room.uploadFile(user.userId, id, dto, file);
  }

  @Get(':id/files/:fileId/download')
  async downloadFile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('fileId') fileId: string,
  ) {
    const { file, content } = await this.room.downloadFile(user.userId, fileId);
    return new StreamableFile(content, {
      type: file.mimeType,
      disposition: `attachment; filename="${file.originalName.replace(/["\\]/g, '_')}"`,
      length: Number(file.size),
    });
  }

  @Patch(':id/files/:fileId/visibility')
  updateFileVisibility(
    @CurrentUser() user: AuthenticatedUser,
    @Param('fileId') fileId: string,
    @Body() dto: UpdateProjectFileVisibilityDto,
  ) {
    return this.room.updateFileVisibility(user.userId, fileId, dto);
  }

  @Delete(':id/files/:fileId')
  deleteFile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('fileId') fileId: string,
  ) {
    return this.room.deleteFile(user.userId, fileId);
  }

  @Get(':id/links')
  listLinks(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.room.listLinks(user.userId, id);
  }

  @Post(':id/links')
  createLink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateProjectLinkDto,
  ) {
    return this.room.createLink(user.userId, id, dto);
  }

  @Delete(':id/links/:linkId')
  async deleteLink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('linkId') linkId: string,
  ) {
    await this.room.deleteLink(user.userId, linkId);
    return { deleted: true };
  }

  @Get(':id/meetings')
  listMeetings(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.room.listMeetings(user.userId, id);
  }

  @Post(':id/meetings')
  createMeeting(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateProjectMeetingDto,
  ) {
    return this.room.createMeeting(user.userId, id, dto);
  }

  @Patch(':id/meetings/:meetingId')
  updateMeeting(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('meetingId') meetingId: string,
    @Body() dto: UpdateProjectMeetingDto,
  ) {
    return this.room.updateMeeting(user.userId, id, meetingId, dto);
  }

  @Post(':id/meetings/:meetingId/cancel')
  cancelMeeting(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('meetingId') meetingId: string,
  ) {
    return this.room.updateMeeting(user.userId, id, meetingId, {
      status: ProjectMeetingStatus.CANCELLED,
    });
  }

  @Get(':id/activity')
  listActivity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.room.listActivity(user.userId, id);
  }
}
