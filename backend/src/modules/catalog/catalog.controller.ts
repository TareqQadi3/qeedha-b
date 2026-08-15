import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PERMISSION_KEYS } from '../iam/constants/permissions';
import { CatalogService } from './catalog.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';

@Controller('catalog')
export class CatalogController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogService: CatalogService,
  ) {}

  // ---- Units ----------------------------------------------------------------

  @RequirePermissions(PERMISSION_KEYS.PRODUCTS_READ)
  @Get('units')
  listUnits(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.catalogService.listUnits(tx, user.companyId),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.PRODUCTS_CREATE)
  @Post('units')
  createUnit(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateUnitDto) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.catalogService.createUnit(tx, user.companyId, user.userId, dto),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.PRODUCTS_UPDATE)
  @Patch('units/:id')
  updateUnit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateUnitDto,
  ) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.catalogService.updateUnit(tx, user.companyId, user.userId, id, dto),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.PRODUCTS_DELETE)
  @Delete('units/:id')
  deleteUnit(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.catalogService.deleteUnit(tx, user.companyId, user.userId, id),
    );
  }

  // ---- Brands -----------------------------------------------------------------

  @RequirePermissions(PERMISSION_KEYS.PRODUCTS_READ)
  @Get('brands')
  listBrands(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.catalogService.listBrands(tx, user.companyId),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.PRODUCTS_CREATE)
  @Post('brands')
  createBrand(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBrandDto) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.catalogService.createBrand(tx, user.companyId, user.userId, dto),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.PRODUCTS_UPDATE)
  @Patch('brands/:id')
  updateBrand(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateBrandDto,
  ) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.catalogService.updateBrand(tx, user.companyId, user.userId, id, dto),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.PRODUCTS_DELETE)
  @Delete('brands/:id')
  deleteBrand(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.catalogService.deleteBrand(tx, user.companyId, user.userId, id),
    );
  }

  // ---- Categories ---------------------------------------------------------------

  @RequirePermissions(PERMISSION_KEYS.PRODUCTS_READ)
  @Get('categories')
  listCategories(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.catalogService.listCategories(tx, user.companyId),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.PRODUCTS_CREATE)
  @Post('categories')
  createCategory(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCategoryDto) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.catalogService.createCategory(tx, user.companyId, user.userId, dto),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.PRODUCTS_UPDATE)
  @Patch('categories/:id')
  updateCategory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.catalogService.updateCategory(tx, user.companyId, user.userId, id, dto),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.PRODUCTS_DELETE)
  @Delete('categories/:id')
  deleteCategory(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.catalogService.deleteCategory(tx, user.companyId, user.userId, id),
    );
  }
}
