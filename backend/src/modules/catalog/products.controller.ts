import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PERMISSION_KEYS } from '../iam/constants/permissions';
import { AddBarcodeDto } from './dto/add-barcode.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productsService: ProductsService,
  ) {}

  @RequirePermissions(PERMISSION_KEYS.PRODUCTS_READ)
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryProductsDto) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.productsService.list(tx, user.companyId, query),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.PRODUCTS_READ)
  @Get(':id')
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.productsService.getOwned(tx, user.companyId, id),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.PRODUCTS_CREATE)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProductDto) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.productsService.create(tx, user.companyId, user.userId, dto),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.PRODUCTS_UPDATE)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.productsService.update(tx, user.companyId, user.userId, id, dto),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.PRODUCTS_DELETE)
  @Delete(':id')
  softDelete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.productsService.softDelete(tx, user.companyId, user.userId, id),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.PRODUCTS_UPDATE)
  @Post(':id/barcodes')
  addBarcode(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AddBarcodeDto,
  ) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.productsService.addBarcode(tx, user.companyId, user.userId, id, dto.barcode),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.PRODUCTS_UPDATE)
  @Delete(':id/barcodes/:barcodeId')
  removeBarcode(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('barcodeId') barcodeId: string,
  ) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.productsService.removeBarcode(tx, user.companyId, user.userId, id, barcodeId),
    );
  }
}
