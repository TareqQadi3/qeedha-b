import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateJoinApplicationDto } from './dto/create-join-application.dto';

/**
 * "Join Us" / careers / partner applications - Website phase spec "Join
 * Us / Partners". No RLS (platform-level, not tenant data - see
 * JoinApplication in schema.prisma), so this reads/writes PrismaService
 * directly. CV storage reuses StorageService (the same abstraction Excel
 * import already uses) rather than inventing a second file-handling path.
 */
@Injectable()
export class CareersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  async apply(dto: CreateJoinApplicationDto, file?: Express.Multer.File) {
    const application = await this.prisma.joinApplication.create({
      data: {
        fullName: dto.fullName,
        email: dto.email,
        mobile: dto.mobile,
        role: dto.role,
        message: dto.message,
      },
    });

    if (file) {
      const key = this.storageService.buildJoinApplicationFileKey(application.id);
      await this.storageService.save(key, file.buffer);
      return this.prisma.joinApplication.update({
        where: { id: application.id },
        data: { cvFileKey: key },
      });
    }

    return application;
  }

  /** Control Center listing. */
  async listApplications() {
    return this.prisma.joinApplication.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async setStatus(id: string, status: 'new' | 'reviewed' | 'accepted' | 'rejected') {
    return this.prisma.joinApplication.update({ where: { id }, data: { status } });
  }
}
