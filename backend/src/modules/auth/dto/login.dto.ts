import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  /** البريد الإلكتروني أو رقم الجوال */
  @IsString()
  identifier: string;

  @IsString()
  @MinLength(1)
  password: string;
}
