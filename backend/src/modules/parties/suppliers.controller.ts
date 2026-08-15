import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PERMISSION_KEYS } from '../iam/constants/permissions';
import { QueryPartiesDto } from './dto/query-parties.dto';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SuppliersService } from './suppliers.service';

@Controller('suppliers')
export class SuppliersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly suppliersService: SuppliersService,
  ) {}

  @RequirePermissions(PERMISSION_KEYS.SUPPLIERS_READ)
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryPartiesDto) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.suppliersService.list(tx, user.companyId, query),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.SUPPLIERS_READ)
  @Get(':id')
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.suppliersService.getOwned(tx, user.companyId, id),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.SUPPLIERS_CREATE)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSupplierDto) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.suppliersService.create(tx, user.companyId, user.userId, dto),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.SUPPLIERS_UPDATE)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDto,
  ) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.suppliersService.update(tx, user.companyId, user.userId, id, dto),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.SUPPLIERS_DELETE)
  @Delete(':id')
  softDelete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.suppliersService.softDelete(tx, user.companyId, user.userId, id),
    );
  }
}
