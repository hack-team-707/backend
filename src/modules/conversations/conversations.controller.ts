import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
  Public,
} from '../../common/auth.decorators';
import {
  ClaimGuestConversationDto,
  CreateConversationDto,
  CreateGuestConversationDto,
  CreateMessageDto,
} from './dto/conversation.dto';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import {
  ConversationsService,
  ConversationTurnResult,
  GuestConversationResult,
} from './conversations.service';

@ApiTags('conversations')
@ApiBearerAuth()
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly service: ConversationsService) {}

  @Public()
  @Post('guest')
  createGuest(
    @Body() dto: CreateGuestConversationDto,
  ): Promise<GuestConversationResult> {
    return this.service.createGuest(dto.message);
  }

  @Public()
  @Delete('guest')
  discardGuest(
    @Body() dto: ClaimGuestConversationDto,
  ): Promise<{ deleted: boolean }> {
    return this.service.discardGuest(dto.guestToken);
  }

  @Post('claim-guest')
  claimGuest(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ClaimGuestConversationDto,
  ): Promise<Conversation> {
    return this.service.claimGuest(user.userId, dto.guestToken);
  }

  @Post() create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateConversationDto,
  ): Promise<Conversation> {
    return this.service.create(user.userId, dto);
  }
  @Get() findMine(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Conversation[]> {
    return this.service.findMine(user.userId);
  }
  @Post(':id/messages') addMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateMessageDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<ConversationTurnResult> {
    return this.service.addMessage(user.userId, id, dto, idempotencyKey);
  }
  @Get(':id/messages') getMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<Message[]> {
    return this.service.getMessages(user.userId, id);
  }
  @Post(':id/confirm') confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<Conversation> {
    return this.service.confirm(user.userId, id);
  }
  @Post(':id/reject') reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<Conversation> {
    return this.service.reject(user.userId, id);
  }
}
