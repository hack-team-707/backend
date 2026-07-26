import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
  Roles,
} from '../../common/auth.decorators';
import { UserRole } from '../../shared';
import { PublicUser } from '../users/entities/user.entity';
import { AdminMetrics, AdminService } from './admin.service';
import { AuditService } from './audit.service';
import { UpdateUserRolesDto } from './dto/admin.dto';
import { AuditLog } from './entities/audit-log.entity';

@ApiTags('admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly service: AdminService,
    private readonly audit: AuditService,
  ) {}

  @Get('metrics')
  metrics(): Promise<AdminMetrics> {
    return this.service.metrics();
  }

  @Get('users')
  users(): Promise<PublicUser[]> {
    return this.service.findUsers();
  }

  @Patch('users/:id/roles')
  updateRoles(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserRolesDto,
  ): Promise<PublicUser> {
    return this.service.updateUserRoles(actor.userId, id, dto);
  }

  @Get('audit')
  auditLog(): Promise<AuditLog[]> {
    return this.audit.findAll();
  }

  @Get('capabilities')
  capabilities() {
    return this.service.capabilities();
  }
}
