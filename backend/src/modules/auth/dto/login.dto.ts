import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  /** البريد الإلكتروني أو رقم الجوال أو رقم الاشتراك (owner login only - see AuthService.login) */
  @IsString()
  identifier: string;

  @IsString()
  @MinLength(1)
  password: string;
}
