import { IsIn } from 'class-validator';

export class SetCommissionStatusDto {
  @IsIn(['pending', 'approved', 'paid'])
  status: 'pending' | 'approved' | 'paid';
}

export class SetApplicationStatusDto {
  @IsIn(['new', 'reviewed', 'accepted', 'rejected'])
  status: 'new' | 'reviewed' | 'accepted' | 'rejected';
}
