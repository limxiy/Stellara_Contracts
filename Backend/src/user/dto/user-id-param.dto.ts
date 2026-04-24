import { Matches } from 'class-validator';

export class UserIdParamDto {
  @Matches(/^c[a-z0-9]{24,}$/i, { message: 'id must be a valid CUID' })
  id: string;
}
