import prisma from '../utils/prisma.js';
import AppError from '../utils/app-error.js';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

class UserService {
  async getAllUsers(query = {}, options = { onlyCustomers: true }) {
    let { q, role, limit = 50, offset = 0 } = query;
    limit = Math.min(Number(limit) || 50, 100); // cap limit to prevent expensive queries
    offset = Number(offset) || 0;

    const where = {};
    if (options.onlyCustomers) {
      where.role = 'CUSTOMER';
    } else if (role) {
      where.role = role;
    }
    if (q) {
      where.OR = [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
      ];
    }

    // Run count and findMany in parallel for better performance
    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          status: true,
          isEmailVerified: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
    ]);

    return { total, data: users };
  }

  async getUserById(id) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        status: true,
        isEmailVerified: true,
        createdAt: true,
        updatedAt: true,
        userAddresses: {
          where: { isDeleted: false },
          select: {
            id: true,
            fullName: true,
            phone: true,
            street: true,
            city: true,
            state: true,
            zipCode: true,
            country: true,
            isDefault: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
    if (!user) throw new AppError('User not found', 404);
    return user;
  }

  async getProfile(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        status: true,
        isEmailVerified: true,
        createdAt: true,
        updatedAt: true,
        userAddresses: {
          where: { isDeleted: false },
          select: {
            id: true,
            street: true,
            city: true,
            state: true,
            zipCode: true,
            country: true,
            isDefault: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
    if (!user) throw new AppError('User not found', 404);
    return user;
  }

  async changePassword(userId, currentPassword, newPassword) {
    // Defer to AuthService for password management. Kept placeholder for compatibility.
    throw new Error('changePassword moved to AuthService. Use AuthService.changePassword instead.');
  }

  async updateUserProfile(userId, data) {
    const updateData = {};
    const allowed = ['firstName', 'lastName', 'phone'];
    
    // Update personal info fields
    for (const k of allowed) if (data[k] !== undefined) updateData[k] = data[k];

    // Handle address updates if provided
    if (data.addresses && Array.isArray(data.addresses) && data.addresses.length > 0) {
      // Get current user to use firstName + lastName as default fullName for addresses
      const currentUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true },
      });

      // Use updated firstName/lastName if provided, otherwise use current user's name
      const userFullName = updateData.firstName || currentUser.firstName;
      const userLastName = updateData.lastName || currentUser.lastName;
      const defaultFullName = `${userFullName} ${userLastName}`.trim();

      const addressesToCreate = data.addresses.map(addr => ({
        userId,
        fullName: addr.fullName || defaultFullName,
        phone: addr.phone || null,
        street: addr.street,
        city: addr.city,
        state: addr.state || null,
        zipCode: addr.zipCode,
        country: addr.country,
        isDefault: addr.isDefault || false,
        isDeleted: false,
        deletedAt: null,
      }));

      try {
        // Soft-delete all existing addresses for this user to avoid FK RESTRICT errors
        // (avoid hard deletes because orders may reference address rows)
        await prisma.userAddress.updateMany({
          where: { userId },
          data: { isDeleted: true, deletedAt: new Date() },
        });

        // Create new addresses using raw insert with timestamps
        const now = new Date();
        await prisma.$executeRawUnsafe(
          `INSERT INTO "UserAddress" (id, "userId", "fullName", phone, street, city, state, "zipCode", country, "isDefault", "isDeleted", "deletedAt", "createdAt", "updatedAt")
           VALUES ${addressesToCreate.map((_, i) => `($${i*13 + 1}, $${i*13 + 2}, $${i*13 + 3}, $${i*13 + 4}, $${i*13 + 5}, $${i*13 + 6}, $${i*13 + 7}, $${i*13 + 8}, $${i*13 + 9}, $${i*13 + 10}, $${i*13 + 11}, $${i*13 + 12}, $${i*13 + 13}, $${i*13 + 14})`).join(',')}`,
          ...addressesToCreate.flatMap(addr => [
            randomUUID(),
            addr.userId,
            addr.fullName,
            addr.phone,
            addr.street,
            addr.city,
            addr.state,
            addr.zipCode,
            addr.country,
            addr.isDefault,
            addr.isDeleted,
            addr.deletedAt,
            now,
            now
          ])
        );
      } catch (err) {
        throw new AppError('Failed to update addresses: ' + err.message, 500);
      }
    }

    if (Object.keys(updateData).length === 0 && (!data.addresses || data.addresses.length === 0)) {
      throw new AppError('No valid fields to update', 400);
    }

    try {
      // Update user profile
      await prisma.user.update({
        where: { id: userId },
        data: updateData,
        select: { id: true },
      });

      // Fetch updated user
      const updated = await prisma.$queryRaw`
        SELECT 
          u.id, u.email, u."firstName", u."lastName", u.phone, 
          u.role, u.status, u."isEmailVerified", u."createdAt", u."updatedAt"
        FROM "User" u
        WHERE u.id = ${userId}
      `;

      const user = updated[0];

      // Fetch addresses
      const addresses = await prisma.$queryRawUnsafe(
        'SELECT id, street, city, state, "zipCode", country, "isDefault", "createdAt", "updatedAt" FROM "UserAddress" WHERE "userId" = $1 AND "isDeleted" = false',
        userId
      );

      return {
        ...user,
        userAddresses: addresses,
      };
    } catch (err) {
      if (err.code === 'P2025') throw new AppError('User not found', 404);
      throw err;
    }
  }

  async updateUser(id, data) {
    const updateData = {};
    const allowed = ['firstName', 'lastName', 'phone', 'role', 'isEmailVerified'];
    for (const k of allowed) if (data[k] !== undefined) updateData[k] = data[k];

    if (Object.keys(updateData).length === 0) throw new AppError('No valid fields to update', 400);

    const updated = await prisma.user.update({ where: { id }, data: updateData, select: { id: true, email: true } });
    return updated;
  }

  async deleteUser(id) {
    // Soft-delete via status change to keep records auditable and reversible
    const updated = await this.changeUserStatus(id, 'DELETED');
    return updated;
  }

  async changeUserStatus(id, status) {
    const allowed = ['ACTIVE', 'SUSPENDED', 'DELETED'];
    if (!allowed.includes(status)) throw new AppError('Invalid status', 400);

    try {
      const data = { status };
      if (status === 'DELETED') {
        data.isDeleted = true;
        data.deletedAt = new Date();
      }

      const updated = await prisma.user.update({
        where: { id },
        data,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          status: true,
          isEmailVerified: true,
          isDeleted: true,
          deletedAt: true,
          createdAt: true,
        },
      });

      return updated;
    } catch (err) {
      if (err.code === 'P2025') throw new AppError('User not found', 404);
      throw err;
    }
  }
}

export default new UserService();
