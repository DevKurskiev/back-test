import { IsString, IsNotEmpty, IsOptional, Matches } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  @IsString()
  @IsOptional()
  role?: string;

  @IsString()
  @Matches(/^\+?\d{10,15}$/, { message: 'Invalid phone number format' })
  phone: string;
}
