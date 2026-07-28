import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { AuthRateLimitGuard } from './auth/auth-rate-limit.guard';
import { CsrfGuard } from './auth/csrf.guard';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { MfaGuard } from './auth/mfa.guard';
import { RolesGuard } from './auth/roles.guard';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { validateEnvironment } from './config/env.validation';
import { AddConversationAiMessages1784800000000 } from './migrations/1784800000000-AddConversationAiMessages';
import { AddPushSubscriptions1784900000000 } from './migrations/1784900000000-AddPushSubscriptions';
import { AddSkillCardAssessment1785000000000 } from './migrations/1785000000000-AddSkillCardAssessment';
import { AddCapabilityPortfolios1785200000000 } from './migrations/1785200000000-AddCapabilityPortfolios';
import { AddProposalDeliverySchedules1785300000000 } from './migrations/1785300000000-AddProposalDeliverySchedules';
import { MakeProposalSubmissionIdempotent1785400000000 } from './migrations/1785400000000-MakeProposalSubmissionIdempotent';
import { FixProposalNotificationLinks1785500000000 } from './migrations/1785500000000-FixProposalNotificationLinks';
import { AddProjectLead1785600000000 } from './migrations/1785600000000-AddProjectLead';
import { AddProjectInvitations1785700000000 } from './migrations/1785700000000-AddProjectInvitations';
import { AddProjectBudgetShares1785800000000 } from './migrations/1785800000000-AddProjectBudgetShares';
import { AddNoMatchResolutions1785900000000 } from './migrations/1785900000000-AddNoMatchResolutions';
import { AddExternalTalent1786000000000 } from './migrations/1786000000000-AddExternalTalent';
import { AddMatchRequests1786100000000 } from './migrations/1786100000000-AddMatchRequests';
import { AddTeamSkillGaps1786200000000 } from './migrations/1786200000000-AddTeamSkillGaps';
import { AddMatchInvitationContext1786300000000 } from './migrations/1786300000000-AddMatchInvitationContext';
import { OneProposalPerTeam1786400000000 } from './migrations/1786400000000-OneProposalPerTeam';
import { AddPrivateProjectRoom1786500000000 } from './migrations/1786500000000-AddPrivateProjectRoom';
import { AddAuthenticationSecurity1786600000000 } from './migrations/1786600000000-AddAuthenticationSecurity';
import { AddMarketplaceFinance1786700000000 } from './migrations/1786700000000-AddMarketplaceFinance';
import { VersionPaymentPlans1786800000000 } from './migrations/1786800000000-VersionPaymentPlans';
import { AddPaymentProviderOperations1786900000000 } from './migrations/1786900000000-AddPaymentProviderOperations';
import { AdminModule } from './modules/admin/admin.module';
import { AiEngineModule } from './modules/ai-engine/ai-engine.module';
import { CapabilityPortfoliosModule } from './modules/capability-portfolios/capability-portfolios.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { DisputesModule } from './modules/disputes/disputes.module';
import { EvidenceModule } from './modules/evidence/evidence.module';
import { ExternalTalentModule } from './modules/external-talent/external-talent.module';
import { MarketplaceFeesModule } from './modules/marketplace-fees/marketplace-fees.module';
import { MatchingModule } from './modules/matching/matching.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PaymentPlansModule } from './modules/payment-plans/payment-plans.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ProblemsModule } from './modules/problems/problems.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { ReputationModule } from './modules/reputation/reputation.module';
import { ProposalsModule } from './modules/proposals/proposals.module';
import { SkillCardsModule } from './modules/skill-cards/skill-cards.module';
import { TeamFormationModule } from './modules/team-formation/team-formation.module';
import { UsersModule } from './modules/users/users.module';
import { WalletsModule } from './modules/wallets/wallets.module';
import { WithdrawalsModule } from './modules/withdrawals/withdrawals.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnvironment,
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: config.get<string>('REDIS_URL') ?? 'redis://localhost:6379',
      }),
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        url: config.getOrThrow<string>('DATABASE_URL'),
        ssl: config.getOrThrow<boolean>('DB_SSL')
          ? { rejectUnauthorized: false }
          : false,
        synchronize: config.getOrThrow<boolean>('DB_SYNCHRONIZE'),
        migrations: [
          AddConversationAiMessages1784800000000,
          AddPushSubscriptions1784900000000,
          AddSkillCardAssessment1785000000000,
          AddCapabilityPortfolios1785200000000,
          AddProposalDeliverySchedules1785300000000,
          MakeProposalSubmissionIdempotent1785400000000,
          FixProposalNotificationLinks1785500000000,
          AddProjectLead1785600000000,
          AddProjectInvitations1785700000000,
          AddProjectBudgetShares1785800000000,
          AddNoMatchResolutions1785900000000,
          AddExternalTalent1786000000000,
          AddMatchRequests1786100000000,
          AddTeamSkillGaps1786200000000,
          AddMatchInvitationContext1786300000000,
          OneProposalPerTeam1786400000000,
          AddPrivateProjectRoom1786500000000,
          AddAuthenticationSecurity1786600000000,
          AddMarketplaceFinance1786700000000,
          VersionPaymentPlans1786800000000,
          AddPaymentProviderOperations1786900000000,
        ],
        migrationsRun: config.getOrThrow<boolean>('DB_RUN_MIGRATIONS'),
        autoLoadEntities: true,
      }),
    }),
    UsersModule,
    AuthModule,
    AiEngineModule,
    CapabilityPortfoliosModule,
    SkillCardsModule,
    ProblemsModule,
    ConversationsModule,
    MatchingModule,
    TeamFormationModule,
    ProjectsModule,
    ProposalsModule,
    EvidenceModule,
    ExternalTalentModule,
    NotificationsModule,
    MarketplaceFeesModule,
    PaymentPlansModule,
    PaymentsModule,
    ReputationModule,
    AdminModule,
    DisputesModule,
    WalletsModule,
    WithdrawalsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: AuthRateLimitGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: MfaGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
