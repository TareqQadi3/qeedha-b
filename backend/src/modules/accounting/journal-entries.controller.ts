import { Controller, Get, Param, Query } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PERMISSION_KEYS } from '../iam/constants/permissions';
import { QueryJournalEntriesDto } from './dto/query-journal-entries.dto';
import { JournalService } from './journal.service';

/**
 * Read-only, deliberately: journal entries are only ever posted by
 * JournalService.postJournalEntry() from within Sales/Purchases/Expenses -
 * there is no POST here. See docs/JOURNAL_ENTRIES.md.
 */
@Controller('accounting/journal-entries')
export class JournalEntriesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journalService: JournalService,
  ) {}

  @RequirePermissions(PERMISSION_KEYS.ACCOUNTING_READ)
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryJournalEntriesDto) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.journalService.list(tx, user.companyId, user.membershipId, query),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.ACCOUNTING_READ)
  @Get(':id')
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.journalService.getOwnedForMembership(tx, user.companyId, user.membershipId, id),
    );
  }
}
