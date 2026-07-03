import { Router } from "express";
import cartController from "../controllers/cart.controller.js";
import { optionalAuthenticate, authenticate } from "../middleware/auth.middleware.js";

const router = Router();

// Attach req.user if a valid JWT is present (does not block guests)
router.use(optionalAuthenticate);

// Cart migration — requires login (JWT required)
router.post("/migrate", authenticate, cartController.migrateCart);

// Cart operations - Support both authenticated users and guest checkout
// Guests provide guestSessionId in request body/query
// Authenticated users provide JWT token in Authorization header
router.post("/", cartController.addToCart);
router.get("/", cartController.getCart);
router.patch("/:id", cartController.updateCartItem);
router.delete("/:id", cartController.removeCartItem);
router.delete("/", cartController.clearCart);

export default router;
