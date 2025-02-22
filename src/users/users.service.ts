import * as bcrypt from 'bcryptjs';

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { CreateUserDto } from '../auth/dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async findByUsername(username: string): Promise<User | undefined> {
    return this.userRepository.findOneBy({ username });
  }

  async findAll(): Promise<User[]> {
    return this.userRepository.find();
  }

  async findOne(id: number): Promise<User> {
    return this.userRepository.findOneBy({ id });
  }

  async findOneById(userId: number): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async getUserWithMaskedData(userId: number, currentUser: User) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'username', 'role', 'phone'] as const,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Если текущий пользователь не админ, удаляем поле `phone`
    if (currentUser.role !== 'admin') {
      delete user.phone;
    }

    return user;
  }

  async create(user: Partial<User>): Promise<User> {
    const newUser = this.userRepository.create(user);
    return this.userRepository.save(newUser);
  }

  async update(id: number, user: Partial<User>): Promise<User> {
    await this.userRepository.update(id, user);
    return this.findOne(id);
  }

  async delete(id: number): Promise<void> {
    await this.userRepository.delete(id);
  }

  async register(userData: CreateUserDto): Promise<User> {
    const existingUser = await this.userRepository.findOneBy({
      username: userData.username,
    });
    if (existingUser) {
      throw new Error('Username already taken');
    }

    const hashedPassword = await bcrypt.hash(userData.password, 10);

    const newUser = this.userRepository.create({
      username: userData.username,
      passwordHash: hashedPassword,
      role: userData.role,
      phone: userData.phone,
    });

    return this.userRepository.save(newUser);
  }
}
