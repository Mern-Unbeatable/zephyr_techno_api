import newsletterService from '../services/newsletter.service.js';
import asyncHandler from '../utils/async-handler.js';

class NewsletterController {
  subscribe = asyncHandler(async (req, res) => {
    const data = await newsletterService.subscribe(req.body);
    console.log(data);
    res.status(201).json({
      success: true,
      message: 'Thank you for subscribing to our newsletter.',
      data,
    });
  });
}

export default new NewsletterController();
