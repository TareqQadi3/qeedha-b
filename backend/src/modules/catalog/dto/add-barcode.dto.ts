import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class AddBarcodeDto {
  @IsString()
  @MinLength(4)
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9\-]+$/, { message: 'الباركود يجب أن يحتوي أحرفًا وأرقامًا فقط' })
  barcode: string;
}
