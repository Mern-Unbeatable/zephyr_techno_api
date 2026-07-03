import businessService from '../services/business.service.js';
import asyncHandler from '../utils/async-handler.js';

class BusinessController {
  // Public: submit business form
  submitBusinessForm = asyncHandler(async (req, res) => {
    const data = await businessService.createBusinessForm(req.body);
    res.status(201).json({ success: true, message: 'Business form submitted.', data });
  });

  // Admin: list with pagination + meta
  getAllBusinessForms = asyncHandler(async (req, res) => {
    const { total, data, page, limit, totalPages } = await businessService.getAllBusinessForms(req.query);
    const meta = {
      total,
      page,
      limit,
      totalPages,
      count: data.length,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
    res.status(200).json({ success: true, data, meta });
  });

  getBusinessFormById = asyncHandler(async (req, res) => {
    const data = await businessService.getBusinessFormById(req.params.id);
    res.status(200).json({ success: true, data });
  });

  updateBusinessForm = asyncHandler(async (req, res) => {
    const data = await businessService.updateBusinessForm(req.params.id, req.body);
    res.status(200).json({ success: true, message: 'Business form updated.', data });
  });

  deleteBusinessForm = asyncHandler(async (req, res) => {
    const data = await businessService.deleteBusinessForm(req.params.id);
    res.status(200).json({ success: true, message: 'Business form deleted (soft).', data });
  });
}

export default new BusinessController();
