import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PublicUser, toPublicUser, User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly repository: Repository<User>,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.repository.findOneBy({ email: email.trim().toLowerCase() });
  }

  findById(id: string): Promise<User | null> {
    return this.repository.findOneBy({ id });
  }

  create(user: User): Promise<User> {
    return this.repository.save(this.repository.create(user));
  }

  async getPublicById(id: string): Promise<PublicUser> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return toPublicUser(user);
  }
}
