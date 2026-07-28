import {
  Controller,
  Get,
  Param,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/auth.decorators';
import { WalletDto, LedgerEntryDto } from './dto/wallet.dto';
import { WalletsService } from './wallets.service';

@ApiTags('wallets')
@ApiBearerAuth()
@Controller('wallets')
export class WalletsController {
  constructor(private readonly wallets: WalletsService) {}

  @Get('me/:currency')
  async getMyWallet(
    @CurrentUser() user: AuthenticatedUser,
    @Param('currency') currency: string,
  ): Promise<WalletDto> {
    return this.wallets.getWalletWithBalance(user.userId, currency);
  }

  @Get('me/:currency/ledger')
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async getMyLedger(
    @CurrentUser() user: AuthenticatedUser,
    @Param('currency') currency: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ): Promise<{ entries: LedgerEntryDto[]; total: number }> {
    return this.wallets.getLedgerEntries(user.userId, currency, limit, offset);
  }

  @Get('users/:userId/:currency')
  async getUserWallet(
    @Param('userId') userId: string,
    @Param('currency') currency: string,
  ): Promise<WalletDto> {
    // Note: In production, add authorization check here
    return this.wallets.getWalletWithBalance(userId, currency);
  }
}
