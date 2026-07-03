import prisma from '../utils/prisma.js';
import AppError from '../utils/app-error.js';

class BusinessService {
  getModel() {
    return prisma.businessForm ?? (globalThis.prisma && globalThis.prisma.businessForm);
  }

  async createBusinessForm(data) {
    const { companyName, name, email, phone, requirements } = data;
    if (!companyName || !name || !email || !phone || !requirements) {
      throw new AppError('All fields are required.', 400);
    }

    const model = this.getModel();
    if (!model) {
      throw new AppError('Prisma model `businessForm` not available. Run `npx prisma generate` and restart the server.', 500);
    }

    const created = await model.create({
      data: { companyName, name, email, phone, requirements },
      select: { id: true, createdAt: true },
    });
    return created;
  }

  async getAllBusinessForms(query = {}) {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Number(query.limit) || 10, 100);
    const offset = (page - 1) * limit;

    const where = { isDeleted: false };

    const model = this.getModel();
    if (!model) {
      throw new AppError('Prisma model `businessForm` not available. Run `npx prisma generate` and restart the server.', 500);
    }

    const [total, data] = await Promise.all([
      model.count({ where }),
      model.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        select: {
          id: true,
          companyName: true,
          name: true,
          email: true,
          phone: true,
          requirements: true,
          status: true,
          createdAt: true,
        },
      }),
    ]);

    const totalPages = Math.max(Math.ceil(total / limit), 1);
    return { total, data, page, limit, totalPages };
  }

  async getBusinessFormById(id) {
    const model = this.getModel();
    if (!model) {
      throw new AppError('Prisma model `businessForm` not available. Run `npx prisma generate` and restart the server.', 500);
    }

    const form = await model.findUnique({
      where: { id },
      select: {
        id: true,
        companyName: true,
        name: true,
        email: true,
        phone: true,
        requirements: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!form || form.isDeleted) {
      throw new AppError('Business form not found.', 404);
    }

    return form;
  }

  async updateBusinessForm(id, data) {
    const model = this.getModel();
    if (!model) {
      throw new AppError('Prisma model `businessForm` not available. Run `npx prisma generate` and restart the server.', 500);
    }

    // Verify form exists
    const existing = await model.findUnique({
      where: { id },
      select: { isDeleted: true },
    });

    if (!existing || existing.isDeleted) {
      throw new AppError('Business form not found.', 404);
    }

    const { companyName, name, email, phone, requirements, status } = data;
    const updateData = {};

    if (companyName !== undefined) updateData.companyName = companyName;
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (requirements !== undefined) updateData.requirements = requirements;
    if (status !== undefined) updateData.status = status;

    const updated = await model.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        companyName: true,
        name: true,
        email: true,
        phone: true,
        requirements: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return updated;
  }

  async deleteBusinessForm(id) {
    const model = this.getModel();
    if (!model) {
      throw new AppError('Prisma model `businessForm` not available. Run `npx prisma generate` and restart the server.', 500);
    }

    // Verify form exists
    const existing = await model.findUnique({
      where: { id },
      select: { isDeleted: true },
    });

    if (!existing || existing.isDeleted) {
      throw new AppError('Business form not found.', 404);
    }

    const deleted = await model.update({
      where: { id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
      select: { id: true },
    });

    return deleted;
  }
}

export default new BusinessService();
