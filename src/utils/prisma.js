import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import AppError from './app-error.js';
import env from '../config/env.js';

const connectionString = env.databaseUrl;

if (!connectionString) {
  throw new AppError('DATABASE_URL is not configured.', 500);
}

const adapter = new PrismaPg({ 
  connectionString,
  // Connection pool configuration for better performance
  pool: {
    max: 20,              // Maximum number of connections in the pool (increased to handle bursts)
    min: 2,               // Minimum number of connections to maintain
    idleTimeoutMillis: 60000,  // Close idle connections after 60 seconds
    connectionTimeoutMillis: 20000,  // Timeout for acquiring a connection (increased to 20s)
  }
});

const basePrisma = new PrismaClient({
  adapter,
  log: env.nodeEnv === 'development'
    ? ['warn', 'error']
    : ['error'],
});

const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async findMany({ model, operation, args, query }) {
        if (!args?.includeDeleted) {
          args.where = { isDeleted: false, ...args.where };
        }
        if (args?.includeDeleted) delete args.includeDeleted;
        return query(args);
      },
      async findFirst({ model, operation, args, query }) {
        if (!args?.includeDeleted) {
          args.where = { isDeleted: false, ...args.where };
        }
        if (args?.includeDeleted) delete args.includeDeleted;
        return query(args);
      },
      async findFirstOrThrow({ model, operation, args, query }) {
        if (!args?.includeDeleted) {
          args.where = { isDeleted: false, ...args.where };
        }
        if (args?.includeDeleted) delete args.includeDeleted;
        return query(args);
      },
      async findUnique({ model, operation, args, query }) {
        // findUnique requires strictly unique fields in `where`. 
        // We override this to findFirst so we can append `isDeleted: false`.
        const { where, includeDeleted, ...rest } = args;
        const newArgs = { where, ...rest };
        if (!includeDeleted) {
          newArgs.where = { ...where, isDeleted: false };
        }
        return basePrisma[model].findFirst(newArgs);
      },
      async findUniqueOrThrow({ model, operation, args, query }) {
        const { where, includeDeleted, ...rest } = args;
        const newArgs = { where, ...rest };
        if (!includeDeleted) {
          newArgs.where = { ...where, isDeleted: false };
        }
        return basePrisma[model].findFirstOrThrow(newArgs);
      },
      async count({ model, operation, args, query }) {
        args = args || {};
        if (!args.includeDeleted) {
          args.where = { isDeleted: false, ...args.where };
        }
        if (args.includeDeleted) delete args.includeDeleted;
        return query(args);
      },
      async aggregate({ model, operation, args, query }) {
        args = args || {};
        if (!args.includeDeleted) {
          args.where = { isDeleted: false, ...args.where };
        }
        if (args.includeDeleted) delete args.includeDeleted;
        return query(args);
      },
      async groupBy({ model, operation, args, query }) {
        args = args || {};
        if (!args.includeDeleted) {
          args.where = { isDeleted: false, ...args.where };
        }
        if (args.includeDeleted) delete args.includeDeleted;
        return query(args);
      },
      async delete({ model, operation, args, query }) {
        const timestamp = Date.now();
        const data = { isDeleted: true, deletedAt: new Date() };

        if (model === 'User') {
          // Fetch existing to append to its email
          const existing = await basePrisma.user.findFirst({ where: args.where, includeDeleted: true });
          if (existing && !existing.email.includes('_deleted_')) {
            data.email = `${existing.email}_deleted_${timestamp}`;
          }
        }

        return basePrisma[model].update({
          where: args.where,
          data,
        });
      },
      async deleteMany({ model, operation, args, query }) {
        args = args || {};
        const timestamp = Date.now();
        const data = { isDeleted: true, deletedAt: new Date() };

        // For deleteMany on User, we can't easily append the specific old email in a single SQL UPDATE query 
        // using Prisma without raw queries, so we skip dynamic renaming here. Usually deleteMany isn't used for Users.

        args.data = data;
        return basePrisma[model].updateMany(args);
      },
    },
  },
});

export default prisma;