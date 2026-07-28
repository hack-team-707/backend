import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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

  save(user: User): Promise<User> {
    return this.repository.save(user);
  }

  async getPublicById(id: string): Promise<PublicUser> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return toPublicUser(user);
  }

  async findPublicByIds(ids: string[]): Promise<PublicUser[]> {
    const uniqueIds = [...new Set(ids)].filter(Boolean);
    if (!uniqueIds.length) return [];
    const users = await this.repository.findBy({ id: In(uniqueIds) });
    return users.map(toPublicUser);
  }

  async searchPublic(query: string): Promise<PublicUser[]> {
    const normalized = query.trim().toLocaleLowerCase();
    const users = await this.repository.find({
      order: { displayName: 'ASC' },
      take: 200,
    });
    return users
      .filter(
        (user) =>
          !normalized ||
          user.displayName.toLocaleLowerCase().includes(normalized) ||
          user.email.toLocaleLowerCase().includes(normalized),
      )
      .slice(0, 30)
      .map(toPublicUser);
  }
}
