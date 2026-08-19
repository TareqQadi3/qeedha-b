import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MinLength,
  ValidateIf,
} from 'class-validator';

/** True once at least one of email/mobile/username is already set on the DTO. */
function hasAnyIdentifier(dto: CreateUserDto): boolean {
  return Boolean(dto.email || dto.mobile || dto.username);
}

export class CreateUserDto {
  @IsString()
  @MinLength(2)
  fullName: string;

  @ValidateIf((dto: CreateUserDto) => !hasAnyIdentifier(dto) || Boolean(dto.email))
  @IsEmail({}, { message: 'بريد إلكتروني غير صحيح' })
  email?: string;

  @ValidateIf((dto: CreateUserDto) => Boolean(dto.mobile))
  @IsString()
  mobile?: string;

  // بديل عن البريد/الجوال - يسمح بحساب فريق (نقطة بيع/محاسب) باسم مستخدم
  // وكلمة مرور فقط، دون الحاجة لبريد إلكتروني حقيقي. راجع IamService.createUser.
  @ValidateIf((dto: CreateUserDto) => Boolean(dto.username))
  @IsString()
  @Matches(/^[a-zA-Z0-9_.-]{3,32}$/, {
    message: 'اسم المستخدم يجب أن يكون 3-32 حرفًا إنجليزيًا/رقمًا (بلا مسافات)',
  })
  username?: string;

  // مطلوبة فقط عند إنشاء هوية جديدة كليًا. إن كان البريد/الجوال/اسم المستخدم
  // يطابق مستخدمًا موجودًا بالفعل (شخص لديه حساب في منشأة أخرى)، يُتجاهل هذا
  // الحقل تمامًا ولا تُعدَّل كلمة مروره - يُضاف فقط كعضوية جديدة في هذه
  // المنشأة. راجع IamService.createUser.
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' })
  password?: string;

  @IsOptional()
  @IsUUID()
  roleId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;
}
