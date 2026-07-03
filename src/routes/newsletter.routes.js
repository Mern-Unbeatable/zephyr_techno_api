import { Router } from 'express';
import newsletterController from '../controllers/newsletter.controller.js';

const router = Router();

router.post('/subscribe', newsletterController.subscribe);

export default router;
