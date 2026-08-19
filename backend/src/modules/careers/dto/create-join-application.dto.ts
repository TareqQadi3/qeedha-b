import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateJoinApplicationDto {
  @IsString()
  @MinLength(2)
  fullName: string;

  @IsEmail({}, { message: 'بريد إلكتروني غير صحيح' })
  email: string;

  @IsOptional()
  @IsString()
  mobile?: string;

  // Free-text (spec examples: Developer, Designer, Software expert,
  // Marketing, Sales, Support, Consultant, Partner, Other) - see
  // JoinApplication.role in schema.prisma for why this isn't an enum.
  @IsString()
  @MinLength(1)
  role: string;

  @IsOptional()
  @IsString()
  message?: string;
}
