import { Injectable } from '@nestjs/common';
import { AuthLookupPrismaService } from '../../common/prisma/auth-lookup-prisma.service';

export interface AuthLookupRecord {
  id: string;
  companyId: string;
  passwordHash: string;
  status: string;
  fullName: string;
  locale: string;
}

/**
 * The only consumer of AuthLookupPrismaService. Resolves an identifier
 * (email or mobile) to credentials *before* a tenant context exists - see
 * AuthLookupPrismaService for why this needs its own DB role.
 */
@Injectable()
export class AuthLookupService {
  constructor(private readonly authLookupPrisma: AuthLookupPrismaService) {}

  async findCredentialsByIdentifier(identifier: string): Promise<AuthLookupRecord | null> {
    const user = await this.authLookupPrisma.user.findFirst({
      where: {
        deletedAt: null,
        OR: [{ email: identifier }, { mobile: identifier }],
      },
      select: {
        id: true,
        companyId: true,
        passwordHash: true,
        status: true,
        fullName: true,
        locale: true,
      },
    });
    return user;
  }
}
