import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { CareersController } from './careers.controller';
import { CareersService } from './careers.service';

@Module({
  imports: [StorageModule],
  controllers: [CareersController],
  providers: [CareersService],
  exports: [CareersService],
})
export class CareersModule {}
