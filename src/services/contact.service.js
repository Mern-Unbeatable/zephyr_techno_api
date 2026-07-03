import prisma from '../utils/prisma.js';
import AppError from '../utils/app-error.js';

class ContactService {
  getModel() {
    return prisma.contactMessage ?? (globalThis.prisma && globalThis.prisma.contactMessage);
  }
  async createContact(data) {
    const { firstName, email, subject, phone, message } = data;
    if (!firstName || !email || !subject || !phone || !message) {
      throw new AppError('All fields are required.', 400);
    }

    const model = this.getModel();
    if (!model) {
      throw new AppError('Prisma model `contactMessage` not available. Run `npx prisma generate` and restart the server.', 500);
    }

    const created = await model.create({
      data: { firstName, email, subject, phone, message, status: 'PENDING' },
      select: { id: true, status: true, createdAt: true },
    });
    return created;
  }

  async getAllContacts(query = {}) {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Number(query.limit) || 10, 100);
    const offset = (page - 1) * limit;

    const where = { isDeleted: false };

    const model = this.getModel();
    if (!model) {
      throw new AppError('Prisma model `contactMessage` not available. Run `npx prisma generate` and restart the server.', 500);
    }

    const [total, data] = await Promise.all([
      model.count({ where }),
      (async () => {
        // Try selecting `status` if available; fall back if Prisma client is out-of-date
        try {
          return await model.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: offset,
            take: limit,
            select: {
              id: true,
              firstName: true,
              email: true,
              subject: true,
              status: true,
              phone: true,
              message: true,
              createdAt: true,
            },
          });
        } catch (err) {
          // If client hasn't been regenerated the `status` field may be unknown — retry without it
          if (err && (err.name === 'PrismaClientValidationError' || /Unknown field `status`/.test(err.message))) {
            return await model.findMany({
              where,
              orderBy: { createdAt: 'desc' },
              skip: offset,
              take: limit,
              select: {
                id: true,
                firstName: true,
                email: true,
                subject: true,
                phone: true,
                message: true,
                createdAt: true,
              },
            });
          }
          throw err;
        }
      })(),
    ]);

    const hasStatus = data.length > 0 && Object.prototype.hasOwnProperty.call(data[0], 'status');
    return { total, data, page, limit, hasStatus };
  }

  async getContactById(id) {
    const model = this.getModel();
    if (!model) {
      throw new AppError('Prisma model `contactMessage` not available. Run `npx prisma generate` and restart the server.', 500);
    }

    let contact;
    try {
      contact = await model.findUnique({
        where: { id },
        select: {
          id: true,
          firstName: true,
          email: true,
          subject: true,
          status: true,
          phone: true,
          message: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (err) {
      if (err && (err.name === 'PrismaClientValidationError' || /Unknown field `status`/.test(err.message))) {
        contact = await model.findUnique({
          where: { id },
          select: {
            id: true,
            firstName: true,
            email: true,
            subject: true,
            phone: true,
            message: true,
            createdAt: true,
            updatedAt: true,
          },
        });
      } else throw err;
    }
    if (!contact) throw new AppError('Contact message not found', 404);
    return contact;
  }

  async updateContact(id, data) {
    const providedKeys = Object.keys(data || {});
    if (providedKeys.length === 0) throw new AppError('No valid fields to update', 400);
    if (providedKeys.length !== 1 || providedKeys[0] !== 'status') {
      throw new AppError('Only status can be updated from this endpoint', 400);
    }
    if (data.status !== 'CONTRACTED') {
      throw new AppError('Only CONTRACTED status is allowed', 400);
    }

    try {
      const model = this.getModel();
      if (!model) {
        throw new AppError('Prisma model `contactMessage` not available. Run `npx prisma generate` and restart the server.', 500);
      }

      const current = await model.findUnique({
        where: { id },
        select: { id: true, status: true },
      });
      if (!current) throw new AppError('Contact message not found', 404);
      if (current.status !== 'PENDING') {
        throw new AppError('Status can only be changed from PENDING to CONTRACTED', 400);
      }

      try {
        const updated = await model.update({ where: { id }, data: { status: 'CONTRACTED' } });
        return updated;
      } catch (err) {
        if (err && (err.name === 'PrismaClientValidationError' || /Unknown field `status`/.test(err.message))) {
          throw new AppError('Status field is not available in Prisma client. Run `npx prisma generate` and restart the server.', 500);
        }
        throw err;
      }
    } catch (err) {
      if (err.code === 'P2025') throw new AppError('Contact message not found', 404);
      throw err;
    }
  }

  async deleteContact(id) {
    // Soft-delete
    try {
      const model = this.getModel();
      if (!model) {
        throw new AppError('Prisma model `contactMessage` not available. Run `npx prisma generate` and restart the server.', 500);
      }

      const updated = await model.update({
        where: { id },
        data: { isDeleted: true, deletedAt: new Date() },
        select: { id: true, isDeleted: true, deletedAt: true },
      });
      return updated;
    } catch (err) {
      if (err.code === 'P2025') throw new AppError('Contact message not found', 404);
      throw err;
    }
  }
}

export default new ContactService();
