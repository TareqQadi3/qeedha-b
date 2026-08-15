import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PERMISSION_KEYS } from '../iam/constants/permissions';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { QueryPartiesDto } from './dto/query-parties.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Controller('customers')
export class CustomersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customersService: CustomersService,
  ) {}

  @RequirePermissions(PERMISSION_KEYS.CUSTOMERS_READ)
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryPartiesDto) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.customersService.list(tx, user.companyId, query),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.CUSTOMERS_READ)
  @Get(':id')
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.customersService.getOwned(tx, user.companyId, id),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.CUSTOMERS_CREATE)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCustomerDto) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.customersService.create(tx, user.companyId, user.userId, dto),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.CUSTOMERS_UPDATE)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.customersService.update(tx, user.companyId, user.userId, id, dto),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.CUSTOMERS_DELETE)
  @Delete(':id')
  softDelete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.customersService.softDelete(tx, user.companyId, user.userId, id),
    );
  }
}
