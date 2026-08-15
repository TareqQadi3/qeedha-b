import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PERMISSION_KEYS } from '../iam/constants/permissions';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { QueryExpensesDto } from './dto/query-expenses.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ExpenseCategoriesService } from './expense-categories.service';
import { ExpensesService } from './expenses.service';

@Controller('expenses')
export class ExpensesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly expensesService: ExpensesService,
    private readonly expenseCategoriesService: ExpenseCategoriesService,
  ) {}

  @RequirePermissions(PERMISSION_KEYS.EXPENSES_READ)
  @Get('categories')
  listCategories(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.expenseCategoriesService.list(tx, user.companyId),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.EXPENSES_CREATE)
  @Post('categories')
  createCategory(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateExpenseCategoryDto) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.expenseCategoriesService.create(tx, user.companyId, user.userId, dto),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.EXPENSES_READ)
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryExpensesDto) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.expensesService.list(tx, user.companyId, user.membershipId, query),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.EXPENSES_READ)
  @Get(':id')
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.expensesService.getOwnedForMembership(tx, user.companyId, user.membershipId, id),
    );
  }

  /** Same idempotency-race handling as SalesController.createSale. */
  @RequirePermissions(PERMISSION_KEYS.EXPENSES_CREATE)
  @Post()
  async createExpense(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateExpenseDto) {
    try {
      return await this.prisma.withTenant(user.companyId, (tx) =>
        this.expensesService.createExpense(tx, user.companyId, user.membershipId, user.userId, dto),
      );
    } catch (err) {
      if (this.expensesService.isDuplicateClientReference(err)) {
        return this.prisma.withTenant(user.companyId, (tx) =>
          this.expensesService.getByClientReference(tx, user.companyId, dto.clientReferenceId),
        );
      }
      throw err;
    }
  }

  @RequirePermissions(PERMISSION_KEYS.EXPENSES_UPDATE)
  @Patch(':id')
  updateExpense(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateExpenseDto,
  ) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.expensesService.updateExpense(
        tx,
        user.companyId,
        user.membershipId,
        user.userId,
        id,
        dto,
      ),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.EXPENSES_DELETE)
  @Delete(':id')
  deleteExpense(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.expensesService.deleteExpense(tx, user.companyId, user.membershipId, user.userId, id),
    );
  }
}
