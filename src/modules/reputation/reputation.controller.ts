import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../../common/auth.decorators';
import { SubmitRatingDto } from './dto/rating.dto';
import { Rating } from './entities/rating.entity';
import {
  ReputationResult,
  ReputationService,
  UserRatingsResult,
} from './reputation.service';

@ApiTags('reputation')
@ApiBearerAuth()
@Controller()
export class ReputationController {
  constructor(private readonly service: ReputationService) {}

  @Post('ratings')
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitRatingDto,
  ): Promise<Rating> {
    return this.service.submit(user.userId, dto);
  }

  @Get('ratings/users/:userId')
  getUserRatings(@Param('userId') userId: string): Promise<UserRatingsResult> {
    return this.service.getUserRatings(userId);
  }

  @Get('reputation/users/:userId')
  getReputation(@Param('userId') userId: string): Promise<ReputationResult> {
    return this.service.getReputation(userId);
  }
}
