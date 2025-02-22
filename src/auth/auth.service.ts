import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from 'src/users/user.entity';
import { Repository } from 'typeorm';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    private jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  async verifyRefreshToken(token: string): Promise<User> {
    try {
      const payload = this.jwtService.verify(token, {
        secret: 'xrate_token_06',
      });

      // Ищем пользователя по ID из токена
      const user = await this.usersService.findOne(payload.sub);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      return user;
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  // Генерация нового access-токена
  generateAccessToken(user: User): string {
    const payload = { username: user.username, sub: user.id, role: user.role };
    return this.jwtService.sign(payload, {
      secret: 'xrate_token_06',
      expiresIn: '8h',
    });
  }

  // Метод обновления токена
  async refreshAccessToken(
    refreshToken: string,
  ): Promise<{ accessToken: string }> {
    const user = await this.verifyRefreshToken(refreshToken);
    const accessToken = this.generateAccessToken(user);
    return { accessToken };
  }

  async login(
    user: User,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = {
      username: user.username,
      sub: user.id,
      role: user.role,
      verified: user.verified,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: 'xrate_token_06',
      expiresIn: '1d',
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: 'xrate_token_06',
      expiresIn: '7d',
    });

    return { accessToken, refreshToken };
  }

  async validateUser(username: string, password: string): Promise<User> {
    const user = await this.usersService.findByUsername(username);
    if (user && (await bcrypt.compare(password, user.passwordHash))) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { passwordHash, ...result } = user;
      return result as User;
    }

    throw new UnauthorizedException('Invalid credentials');
  }
}
