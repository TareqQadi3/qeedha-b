import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { assertCorsConfiguredForProduction, buildCorsOptions } from './config/cors.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  assertCorsConfiguredForProduction(config);

  app.use(helmet());
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors(buildCorsOptions(config));

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);
  Logger.log(`Qeedha Accounting API يعمل على المنفذ ${port}`, 'Bootstrap');
}

bootstrap();
