import {
  DeepPartial,
  FindManyOptions,
  FindOptionsWhere,
  Repository,
} from 'typeorm';

interface EntityWithId {
  id: string;
}

export function createMockRepository<T extends EntityWithId>(): Repository<T> {
  const records = new Map<string, T>();
  const matches = (entity: T, where?: FindOptionsWhere<T>): boolean =>
    !where ||
    Object.entries(where).every(
      ([key, value]) => entity[key as keyof T] === value,
    );

  return {
    create: (input: DeepPartial<T>) => input as T,
    save: async (entity: T) => {
      records.set(entity.id, entity);
      return entity;
    },
    update: async (criteria: FindOptionsWhere<T>, partial: DeepPartial<T>) => {
      const entity = [...records.values()].find((item) =>
        matches(item, criteria),
      );
      if (!entity) return { raw: {}, generatedMaps: [], affected: 0 };
      Object.assign(entity, partial);
      records.set(entity.id, entity);
      return { raw: {}, generatedMaps: [], affected: 1 };
    },
    findOneBy: async (where: FindOptionsWhere<T>) =>
      [...records.values()].find((entity) => matches(entity, where)) ?? null,
    find: async (options?: FindManyOptions<T>) => {
      const found = [...records.values()].filter((entity) =>
        matches(entity, options?.where as FindOptionsWhere<T> | undefined),
      );
      const order = options?.order;
      if (order) {
        const [key, direction] = Object.entries(order)[0] ?? [];
        if (key) {
          found.sort((left, right) => {
            const a = String(left[key as keyof T]);
            const b = String(right[key as keyof T]);
            return (direction === 'DESC' ? -1 : 1) * a.localeCompare(b);
          });
        }
      }
      return found;
    },
    merge: (target: T, ...sources: DeepPartial<T>[]) =>
      Object.assign(target, ...sources),
    delete: async (criteria: FindOptionsWhere<T>) => {
      const entity = [...records.values()].find((item) =>
        matches(item, criteria),
      );
      const affected = entity && records.delete(entity.id) ? 1 : 0;
      return { raw: {}, affected };
    },
  } as unknown as Repository<T>;
}
