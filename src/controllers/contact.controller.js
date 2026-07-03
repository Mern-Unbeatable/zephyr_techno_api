import contactService from '../services/contact.service.js';
import asyncHandler from '../utils/async-handler.js';

class ContactController {
  // Public: submit contact form
  submitContact = asyncHandler(async (req, res) => {
    const data = await contactService.createContact(req.body);
    res.status(201).json({ success: true, message: 'Message submitted.', data });
  });

  // Admin: list with pagination + meta
  getAllContacts = asyncHandler(async (req, res) => {
    const { total, data, page, limit, hasStatus } = await contactService.getAllContacts(req.query);
    const totalPages = Math.max(Math.ceil(total / limit), 1);
    const meta = {
      total,
      page,
      limit,
      totalPages,
      count: data.length,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
    // indicate whether `status` field was present in returned rows
    meta.hasStatus = !!hasStatus;
    res.status(200).json({ success: true, data, meta });
  });

  getContactById = asyncHandler(async (req, res) => {
    const data = await contactService.getContactById(req.params.id);
    res.status(200).json({ success: true, data });
  });

  updateContact = asyncHandler(async (req, res) => {
    const data = await contactService.updateContact(req.params.id, req.body);
    res.status(200).json({ success: true, message: 'Contact updated.', data });
  });

  deleteContact = asyncHandler(async (req, res) => {
    const data = await contactService.deleteContact(req.params.id);
    res.status(200).json({ success: true, message: 'Contact deleted (soft).', data });
  });
}

export default new ContactController();
