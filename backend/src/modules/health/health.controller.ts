import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Milestone 2 "Health Check": a single endpoint reporting both application
 * and database liveness, suitable as both a readiness and liveness probe
 * for Demo/Staging (this app has no separate warm-up phase distinguishing
 * the two, so one endpoint doing both is correct here - see docs/DEPLOYMENT.md
 * "Health check"). Returns HTTP 503 (not 200) when the database check fails,
 * so container/orchestrator health checks that only look at the status code
 * (e.g. `docker HEALTHCHECK curl -f`) detect the failure correctly. Reports
 * which check failed without leaking connection strings, stack traces, or
 * any other internal detail.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check() {
    const checks: Record<string, 'ok' | 'error'> = { app: 'ok', database: 'ok' };
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      checks.database = 'error';
    }

    const healthy = Object.values(checks).every((v) => v === 'ok');
    if (!healthy) {
      const failed = Object.entries(checks)
        .filter(([, v]) => v === 'error')
        .map(([k]) => k)
        .join(', ');
      // HttpExceptionFilter reformats every thrown exception into a uniform
      // {error:{code,message,details}} envelope, so `checks` itself
      // wouldn't survive as a separate field here - the failing check names
      // are folded into the message instead so they're still visible.
      throw new ServiceUnavailableException(`فحص غير سليم: ${failed}`);
    }
    return { status: 'ok', timestamp: new Date().toISOString(), checks };
  }
}
