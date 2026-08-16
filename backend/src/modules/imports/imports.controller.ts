import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PERMISSION_KEYS } from '../iam/constants/permissions';
import { MAX_IMPORT_FILE_SIZE_BYTES } from './constants/import-limits';
import { CreateImportJobDto } from './dto/create-import-job.dto';
import { QueryImportJobsDto } from './dto/query-import-jobs.dto';
import { SetImportMappingDto } from './dto/set-import-mapping.dto';
import { IMPORT_FIELD_DEFS } from './constants/import-field-defs';
import { ImportsService } from './imports.service';

@Controller('imports')
export class ImportsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly importsService: ImportsService,
  ) {}

  /** Static field definitions per supported entity type - lets the frontend build the "what does this import need" screen before any file is chosen. */
  @RequirePermissions(PERMISSION_KEYS.IMPORT_READ)
  @Get('entity-types')
  listEntityTypes() {
    return Object.entries(IMPORT_FIELD_DEFS).map(([entityType, fields]) => ({
      entityType,
      fields,
    }));
  }

  @RequirePermissions(PERMISSION_KEYS.IMPORT_READ)
  @Get('jobs')
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryImportJobsDto) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.importsService.list(tx, user.companyId, query),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.IMPORT_READ)
  @Get('jobs/:id')
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.importsService.getOwned(tx, user.companyId, id),
    );
  }

  /** Same idempotency-race handling as SalesController/PurchasesController - see docs/IMPORT_EXCEL.md "Idempotency". */
  @RequirePermissions(PERMISSION_KEYS.IMPORT_CREATE)
  @Post('jobs')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_FILE_SIZE_BYTES } }))
  async createJob(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateImportJobDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('لم يتم إرفاق ملف');
    }
    try {
      return await this.importsService.createJob(
        user.companyId,
        user.membershipId,
        user.userId,
        dto,
        file,
      );
    } catch (err) {
      if (this.importsService.isDuplicateClientReference(err) && dto.clientReferenceId) {
        return this.prisma.withTenant(user.companyId, (tx) =>
          this.importsService.getByClientReference(tx, user.companyId, dto.clientReferenceId!),
        );
      }
      throw err;
    }
  }

  @RequirePermissions(PERMISSION_KEYS.IMPORT_CREATE)
  @Patch('jobs/:id/mapping')
  setMapping(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SetImportMappingDto,
  ) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.importsService.setMapping(tx, user.companyId, user.userId, id, dto),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.IMPORT_CREATE)
  @Get('jobs/:id/preview')
  preview(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.importsService.preview(tx, user.companyId, id),
    );
  }

  @RequirePermissions(PERMISSION_KEYS.IMPORT_CREATE)
  @Post('jobs/:id/validate')
  validate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.importsService.runValidation(user.companyId, user.userId, id);
  }

  @RequirePermissions(PERMISSION_KEYS.IMPORT_CREATE)
  @Post('jobs/:id/confirm')
  confirm(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.importsService.confirmImport(user.companyId, user.membershipId, user.userId, id);
  }

  @RequirePermissions(PERMISSION_KEYS.IMPORT_CREATE)
  @Post('jobs/:id/cancel')
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.prisma.withTenant(user.companyId, (tx) =>
      this.importsService.cancel(tx, user.companyId, user.userId, id),
    );
  }
}
