import prisma from "../utils/prisma.js";
import AppError from "../utils/app-error.js";
import { buildImageUrl } from "../utils/url.js";
import { resolveStorageStock, resolveStoragePrice } from "../utils/stock.js";

/**
 * CartService
 * Handles user cart operations with product option selections
 */
class CartService {
  /**
   * Add product to cart with selected options
   * Supports both authenticated users (userId) and guests (guestSessionId)
   * User selects: color, storage, RAM when adding to cart
   */
  async addToCart(userId, guestSessionId, data) {
    const { productId, colorId, storageOptionId, ramOptionId, quantity } = data;

    // Validate that either userId or guestSessionId is provided
    if (!userId && !guestSessionId) {
      throw new AppError("Either userId or guestSessionId required", 400);
    }

    // Validate quantity
    const qty = parseInt(quantity) || 1;
    if (qty < 1) {
      throw new AppError("Quantity must be at least 1", 400);
    }

    // Verify product exists and is active
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        colors: {
          where: { colorId },
          include: { color: true },
        },
        storageOptions: {
          where: { storageOptionId },
          include: { storageOption: true },
        },
        ramOptions: {
          where: { ramOptionId },
          include: { ramOption: true },
        },
      },
    });

    if (!product) {
      throw new AppError("Product not found", 404);
    }

    if (product.listingStatus !== "ACTIVE") {
      throw new AppError("Product is not available for purchase", 400);
    }

    // Verify selected options are available for this product
    if (product.colors.length === 0) {
      throw new AppError("Selected color is not available for this product", 400);
    }
    if (product.storageOptions.length === 0) {
      throw new AppError("Selected storage option is not available for this product", 400);
    }
    if (product.ramOptions.length === 0) {
      throw new AppError("Selected RAM option is not available for this product", 400);
    }

    // Check stock availability for the selected storage option
    const storageStock = resolveStorageStock(
      product.storageOptions[0],
      product.stockQuantity,
    );
    if (storageStock <= 0) {
      throw new AppError("Product is currently out of stock", 400);
    }
    if (storageStock < qty) {
      throw new AppError(`Cannot add ${qty} items. Only ${storageStock} item(s) in stock`, 400);
    }

    // Ensure cart exists (create if missing)
    let cart;
    if (userId) {
      cart = await prisma.cart.findUnique({ where: { userId } });
      if (!cart) {
        cart = await prisma.cart.create({ data: { userId } });
      }
    } else {
      // Guest checkout - use sessionId
      cart = await prisma.cart.findUnique({ where: { sessionId: guestSessionId } });
      if (!cart) {
        cart = await prisma.cart.create({ data: { sessionId: guestSessionId } });
      }
    }

    // Check if this exact configuration already exists in user's cart
    const existingCartItem = await prisma.cartItem.findFirst({
      where: {
        cartId: cart.id,
        productId,
        colorId,
        storageOptionId,
        ramOptionId,
      },
    });

    if (existingCartItem) {
      // Update quantity instead of creating duplicate
      const newQuantity = existingCartItem.quantity + qty;

      // Validate against stock
      if (storageStock < newQuantity) {
        if (storageStock <= existingCartItem.quantity) {
          throw new AppError(
            `Cannot add more. You already have all available items (${storageStock}) in your cart.`,
            400,
          );
        } else {
          const remaining = storageStock - existingCartItem.quantity;
          throw new AppError(
            `Cannot add ${qty} more. You can only add ${remaining} more item(s).`,
            400,
          );
        }
      }

      const updated = await prisma.cartItem.update({
        where: { id: existingCartItem.id },
        data: { quantity: newQuantity },
        include: {
          product: {
            include: {
              productGalleries: {
                orderBy: { displayOrder: 'asc' },
                take: 1,
              },
              storageOptions: {
                select: { storageOptionId: true, stockQuantity: true, price: true },
              },
            },
          },
          color: true,
          storageOption: true,
          ramOption: true,
        },
      });

      return this.#formatCartItem({
        ...updated,
        product,
        color: product.colors[0].color,
        storageOption: product.storageOptions[0].storageOption,
        ramOption: product.ramOptions[0].ramOption,
      });
    }

    // Create new cart item
    const cartItem = await prisma.cartItem.create({
      data: {
        cartId: cart.id,
        productId,
        colorId,
        storageOptionId,
        ramOptionId,
        quantity: qty,
      },
      include: {
        product: {
          include: {
            productGalleries: {
              orderBy: { displayOrder: 'asc' },
              take: 1,
            },
            storageOptions: {
              select: { storageOptionId: true, stockQuantity: true, price: true },
            },
          },
        },
        color: true,
        storageOption: true,
        ramOption: true,
      },
    });

    return this.#formatCartItem(cartItem);
  }

  /**
   * Get user's cart with all items
   * Supports both authenticated users (userId) and guests (guestSessionId)
   */
  async getCart(userId, guestSessionId) {
    // Validate that either userId or guestSessionId is provided
    if (!userId && !guestSessionId) {
      throw new AppError("Either userId or guestSessionId required", 400);
    }

    // Single query: fetch cart + all its active items in one DB round-trip
    const whereClause = userId ? { userId } : { sessionId: guestSessionId };
    const cart = await prisma.cart.findUnique({
      where: whereClause,
      include: {
        cartItems: {
          where: { isDeleted: false },
          include: {
            product: {
              include: {
                productGalleries: {
                  orderBy: { displayOrder: 'asc' },
                  take: 1,
                },
                storageOptions: {
                  select: { storageOptionId: true, stockQuantity: true, price: true },
                },
              },
            },
            color: true,
            storageOption: true,
            ramOption: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!cart) return { items: [], subtotal: 0, totalItems: 0 };

    const items = cart.cartItems.map((item) => this.#formatCartItem(item));

    // Calculate totals
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const totalItems = items.length; // Count of unique items in cart (not sum of quantities)

    return {
      items,
      subtotal,
      totalItems,
    };
  }

  /**
   * Update cart item quantity
   * Supports both authenticated users and guests
   */
  async updateCartItemQuantity(userId, guestSessionId, cartItemId, quantity) {
    // Validate that either userId or guestSessionId is provided
    if (!userId && !guestSessionId) {
      throw new AppError("Either userId or guestSessionId required", 400);
    }

    const qty = parseInt(quantity);
    if (qty < 1) {
      throw new AppError("Quantity must be at least 1", 400);
    }

    // Verify ownership
    const cartItem = await prisma.cartItem.findUnique({
      where: { id: cartItemId },
      include: {
        product: true,
        cart: true,
      },
    });

    if (!cartItem) {
      throw new AppError("Cart item not found", 404);
    }

    // Authorization: ensure the cart belongs to this user/guest
    // If logged-in user hits a guest cart (not yet migrated), auto-migrate first
    if (userId) {
      if (!cartItem.cart) {
        throw new AppError('Unauthorized to modify this cart item', 403);
      }
      if (cartItem.cart.userId !== userId) {
        if (cartItem.cart.userId === null && cartItem.cart.sessionId) {
          // Guest cart — migrate it to this user then re-fetch
          await this.migrateGuestCartToUser(cartItem.cart.sessionId, userId);
          const migrated = await prisma.cartItem.findFirst({
            where: {
              cart: { userId },
              productId: cartItem.productId,
              colorId: cartItem.colorId,
              storageOptionId: cartItem.storageOptionId,
              ramOptionId: cartItem.ramOptionId,
            },
            include: { product: true, cart: true },
          });
          if (!migrated) throw new AppError('Cart item not found after migration', 404);
          cartItemId = migrated.id;
          cartItem.product = migrated.product;
        } else {
          throw new AppError('Unauthorized to modify this cart item', 403);
        }
      }
    }
    if (guestSessionId && (!cartItem.cart || cartItem.cart.sessionId !== guestSessionId)) {
      throw new AppError('Unauthorized to modify this cart item', 403);
    }

    // Check stock for the selected storage option
    const storageBridge = await prisma.productStorageOption.findFirst({
      where: {
        productId: cartItem.productId,
        storageOptionId: cartItem.storageOptionId,
      },
      select: { stockQuantity: true },
    });
    const storageStock = resolveStorageStock(
      storageBridge,
      cartItem.product.stockQuantity,
    );
    if (storageStock < qty) {
      throw new AppError(`Only ${storageStock} items in stock`, 400);
    }

    const updated = await prisma.cartItem.update({
      where: { id: cartItemId },
      data: { quantity: qty },
      include: {
        product: {
          include: {
            productGalleries: {
              orderBy: { displayOrder: "asc" },
              take: 1,
            },
            storageOptions: {
              select: { storageOptionId: true, stockQuantity: true, price: true },
            },
          },
        },
        color: true,
        storageOption: true,
        ramOption: true,
      },
    });

    return this.#formatCartItem(updated);
  }

  /**
   * Remove item from cart
   * Supports both authenticated users and guests
   */
  async removeCartItem(userId, guestSessionId, cartItemId) {
    // Validate that either userId or guestSessionId is provided
    if (!userId && !guestSessionId) {
      throw new AppError("Either userId or guestSessionId required", 400);
    }

    // Verify ownership
    const cartItem = await prisma.cartItem.findUnique({
      where: { id: cartItemId },
      include: { cart: true },
    });

    if (!cartItem) {
      throw new AppError('Cart item not found', 404);
    }

    // Authorization: ensure the cart belongs to this user/guest
    // If logged-in user hits a guest cart (not yet migrated), auto-migrate first
    if (userId) {
      if (!cartItem.cart) {
        throw new AppError('Unauthorized to remove this cart item', 403);
      }
      if (cartItem.cart.userId !== userId) {
        if (cartItem.cart.userId === null && cartItem.cart.sessionId) {
          // Guest cart — migrate it to this user, then remove by finding the migrated item
          await this.migrateGuestCartToUser(cartItem.cart.sessionId, userId);
          const migrated = await prisma.cartItem.findFirst({
            where: {
              cart: { userId },
              productId: cartItem.productId,
              colorId: cartItem.colorId,
              storageOptionId: cartItem.storageOptionId,
              ramOptionId: cartItem.ramOptionId,
            },
          });
          if (migrated) await prisma.cartItem.delete({ where: { id: migrated.id } });
          return true;
        } else {
          throw new AppError('Unauthorized to remove this cart item', 403);
        }
      }
    }
    if (guestSessionId && (!cartItem.cart || cartItem.cart.sessionId !== guestSessionId)) {
      throw new AppError('Unauthorized to remove this cart item', 403);
    }

    await prisma.cartItem.delete({ where: { id: cartItemId } });

    return true;
  }

  /**
   * Clear entire cart
   * Supports both authenticated users and guests
   */
  async clearCart(userId, guestSessionId) {
    // Validate that either userId or guestSessionId is provided
    if (!userId && !guestSessionId) {
      throw new AppError("Either userId or guestSessionId required", 400);
    }

    const whereClause = userId ? { userId } : { sessionId: guestSessionId };
    const cart = await prisma.cart.findUnique({ where: whereClause });
    if (!cart) return true;

    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });

    return true;
  }

  /**
   * Format cart item for response
   */
  #formatCartItem(item) {
    const thumbnail = item.product.productGalleries?.[0]
      ? buildImageUrl(item.product.productGalleries[0].imageUrl)
      : null;
    const storageBridge = item.product.storageOptions?.find(
      (row) => row.storageOptionId === item.storageOptionId,
    );
    const storageStock = resolveStorageStock(
      storageBridge,
      item.product.stockQuantity,
    );
    const unitPrice = resolveStoragePrice(
      storageBridge,
      item.product.basePrice,
    );

    return {
      id: item.id,
      quantity: item.quantity,
      product: {
        id: item.product.id,
        title: item.product.title,
        basePrice: unitPrice,
        stockQuantity: storageStock,
        seriesId: item.product.seriesId,
        deviceModelId: item.product.deviceModelId,
        thumbnail,
      },
      selectedOptions: {
        color: {
          id: item.color.id,
          name: item.color.name,
        },
        storage: {
          id: item.storageOption.id,
          name: item.storageOption.name,
        },
        ram: {
          id: item.ramOption.id,
          name: item.ramOption.name,
        },
      },
      // Calculate item total (price × quantity)
      total: unitPrice * item.quantity,
      createdAt: item.createdAt,
    };
  }

  /**
   * Migrate guest cart items to authenticated user's cart
   * Called when a guest logs in
   * Merges guest items into user cart (updates quantity if same product exists)
   */
  async migrateGuestCartToUser(guestSessionId, userId) {
    if (!guestSessionId || !userId) {
      return; // Nothing to migrate
    }

    try {
      // Find guest cart
      const guestCart = await prisma.cart.findUnique({
        where: { sessionId: guestSessionId },
        include: { cartItems: true },
      });

      // If no guest cart or no items, nothing to migrate
      if (!guestCart || guestCart.cartItems.length === 0) {
        return;
      }

      // Find or create user's authenticated cart
      let userCart = await prisma.cart.findUnique({
        where: { userId },
      });

      if (!userCart) {
        userCart = await prisma.cart.create({
          data: { userId },
        });
      }

      // Migrate each guest cart item to user cart
      for (const guestItem of guestCart.cartItems) {
        // Check if same product configuration already exists in user's cart
        const existingItem = await prisma.cartItem.findFirst({
          where: {
            cartId: userCart.id,
            productId: guestItem.productId,
            colorId: guestItem.colorId,
            storageOptionId: guestItem.storageOptionId,
            ramOptionId: guestItem.ramOptionId,
          },
        });

        if (existingItem) {
          // If product already in user's cart, add guest quantity to it
          const newQuantity = existingItem.quantity + guestItem.quantity;

          // Verify stock before updating
          const product = await prisma.product.findUnique({
            where: { id: guestItem.productId },
            select: { stockQuantity: true },
          });
          const storageBridge = await prisma.productStorageOption.findFirst({
            where: {
              productId: guestItem.productId,
              storageOptionId: guestItem.storageOptionId,
            },
            select: { stockQuantity: true },
          });
          const storageStock = resolveStorageStock(
            storageBridge,
            product?.stockQuantity ?? 0,
          );

          if (storageStock >= newQuantity) {
            await prisma.cartItem.update({
              where: { id: existingItem.id },
              data: { quantity: newQuantity },
            });
          }
        } else {
          // If product not in user's cart, add it
          await prisma.cartItem.create({
            data: {
              cartId: userCart.id,
              productId: guestItem.productId,
              colorId: guestItem.colorId,
              storageOptionId: guestItem.storageOptionId,
              ramOptionId: guestItem.ramOptionId,
              quantity: guestItem.quantity,
            },
          });
        }
      }

      // Delete guest cart and its items (cascade delete via Prisma)
      await prisma.cart.delete({
        where: { id: guestCart.id },
      });

      return { migrated: true, itemCount: guestCart.cartItems.length };
    } catch (error) {
      // Log error but don't throw - migration is a nice-to-have feature
      console.error('[CartService] Migration failed:', error);
      return { migrated: false };
    }
  }
}

export default new CartService();
