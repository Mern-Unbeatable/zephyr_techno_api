import usersService from '../services/users.service.js';
import asyncHandler from '../utils/async-handler.js';

class UsersController {
  getAllUsers = asyncHandler(async (req, res) => {
    // Page-based pagination: accept `page` & `limit` query params
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = (page - 1) * limit;

    const result = await usersService.getAllUsers({ ...req.query, limit, offset }, { onlyCustomers: true });

    const total = result.total || 0;
    const totalPages = Math.max(Math.ceil(total / limit), 1);
    const meta = {
      total,
      page,
      limit,
      totalPages,
      count: result.data.length,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };

    res.status(200).json({ success: true, data: result.data, meta });
  });

  getUserById = asyncHandler(async (req, res) => {
    const data = await usersService.getUserById(req.params.id);
    // Only return individual user if they are a CUSTOMER; hide admins
    if (data.role !== 'CUSTOMER') {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.status(200).json({ success: true, data });
  });

  /**
   * GET /api/users/me
   * Return current authenticated user's profile
   */
  getProfile = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const profile = await usersService.getProfile(userId);
    res.status(200).json({ success: true, data: profile });
  });

  /**
   * PUT /api/users/me
   * Update current authenticated user's profile
   */
  updateProfile = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { firstName, lastName, phone, addresses } = req.body;
    
    const updateData = {};
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (phone !== undefined) updateData.phone = phone;
    if (addresses !== undefined) updateData.addresses = addresses;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update provided' });
    }

    const updated = await usersService.updateUserProfile(userId, updateData);
    res.status(200).json({ success: true, message: 'Profile updated successfully.', data: updated });
  });

  /**
   * POST /api/users/change-password
   */
  // changePassword moved to AuthController to keep auth flows centralized



  updateUser = asyncHandler(async (req, res) => {
    // If `status` is provided, treat this as a status change (ACTIVE, SUSPENDED, DELETED)
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'status')) {
      const { status } = req.body;
      const updated = await usersService.changeUserStatus(req.params.id, status);
      return res.status(200).json({ success: true, message: 'User status updated.', data: updated });
    }

    const data = await usersService.updateUser(req.params.id, req.body);
    res.status(200).json({ success: true, message: 'User updated.', data });
  });

  deleteUser = asyncHandler(async (req, res) => {
    const updated = await usersService.deleteUser(req.params.id);
    res.status(200).json({ success: true, message: 'User deleted (soft).', data: updated });
  });

  changeStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const updated = await usersService.changeUserStatus(id, status);
    res.status(200).json({ success: true, message: 'User status updated.', data: updated });
  });
}

export default new UsersController();
