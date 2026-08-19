import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { MAX_CV_FILE_SIZE_BYTES } from './constants/careers-limits';
import { CareersService } from './careers.service';
import { CreateJoinApplicationDto } from './dto/create-join-application.dto';

/** Public "Join Us" submission (Website phase spec) - admin listing/review lives on PlatformAdminController instead. */
@Public()
@Controller('careers')
export class CareersController {
  constructor(private readonly careersService: CareersService) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  @Post('apply')
  @UseInterceptors(FileInterceptor('cv', { limits: { fileSize: MAX_CV_FILE_SIZE_BYTES } }))
  apply(@Body() dto: CreateJoinApplicationDto, @UploadedFile() file?: Express.Multer.File) {
    return this.careersService.apply(dto, file);
  }
}
