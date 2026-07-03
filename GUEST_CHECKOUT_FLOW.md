# Guest Checkout & Authenticated User Flow Documentation

## Overview

This document describes the **complete end-to-end flow** — from adding a product to cart all the way through Stripe payment confirmation — for both **guest users** and **authenticated (logged-in) users**.

It also covers the **cart migration logic** that runs when a guest user decides to log in mid-session, so their cart items are preserved.

---

## Table of Contents

1. [Flow Summary Diagram](#flow-summary-diagram)
2. [Guest User Flow](#guest-user-flow)
3. [Authenticated User Flow](#authenticated-user-flow)
4. [Cart Migration: Guest → Login](#cart-migration-guest--login)
5. [Frontend Utility Code](#frontend-utility-code)
6. [API Endpoints Reference](#api-endpoints-reference)
7. [Key Differences](#key-differences)
8. [Error Handling](#error-handling)
9. [Database Relations](#database-relations)
10. [Security Considerations](#security-considerations)

---

## Flow Summary Diagram

```
GUEST USER                                  AUTHENTICATED USER
──────────────────────────────────────────────────────────────────

[1] Generate UUID → localStorage            [1] POST /api/auth/login → get JWT token

[2] POST /api/cart                          [2] POST /api/cart
    body: { guestSessionId, ... }               header: Authorization: Bearer <token>

[3] GET /api/cart?guestSessionId=...        [3] GET /api/cart
                                                header: Authorization: Bearer <token>

[4] PATCH /api/cart/:id                     [4] PATCH /api/cart/:id
    body: { guestSessionId, quantity }          header: Authorization + body: { quantity }

[5] DELETE /api/cart/:id                    [5] DELETE /api/cart/:id
    body: { guestSessionId }                    header: Authorization

[6] POST /api/public/product/checkout       [6] POST /api/public/product/checkout
    body: { guestSessionId,                     header: Authorization
            guestEmail,                         body: { shippingAddress,
            shippingAddress, ... }                       shippingMethod, ... }
    → returns checkoutUrl + sessionId           → returns checkoutUrl + sessionId

[7] Redirect → window.location = checkoutUrl   [7] Redirect → window.location = checkoutUrl
    (Stripe Checkout page)                          (Stripe Checkout page)

[8] User pays on Stripe                     [8] User pays on Stripe
    Stripe → redirects to /checkout/success     Stripe → redirects to /checkout/success

[9] POST /api/public/product/checkout/confirm  [9] POST /api/public/product/checkout/confirm
    body: { sessionId }                             body: { sessionId }
    → orderStatus: PROCESSING, PAID                 → orderStatus: PROCESSING, PAID

                                            [10] GET /api/orders  (order history)
                                            [11] POST /api/orders/:id/cancel
```

---

## Guest User Flow

### Overview
A guest user can browse, add products to cart, and complete a purchase **without creating an account**. All operations are tracked using a unique `guestSessionId` UUID stored in the browser.

---

### Step 1 — Initialize Guest Session

**What Happens:**
- Frontend generates a UUID and stores it in `localStorage`
- Every subsequent cart/checkout API call includes this UUID
- No backend API call needed — this is purely frontend logic

```javascript
// utils/guestSession.js

export function getOrCreateGuestSessionId() {
  let sessionId = localStorage.getItem('guestSessionId');
  if (!sessionId) {
    sessionId = crypto.randomUUID(); // native browser API (all modern browsers)
    localStorage.setItem('guestSessionId', sessionId);
  }
  return sessionId;
}

export function clearGuestSessionId() {
  localStorage.removeItem('guestSessionId');
}
```

---

### Step 2 — Add Product to Cart

**API:** `POST /api/cart`

**Frontend Code:**
```javascript
async function addToCartGuest({ productId, colorId, storageOptionId, ramOptionId, quantity }) {
  const guestSessionId = getOrCreateGuestSessionId();

  const res = await fetch('/api/cart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      guestSessionId,
      productId,
      colorId,
      storageOptionId,
      ramOptionId,
      quantity,
    }),
  });

  return res.json();
}
```

**Request Body:**
```json
{
  "guestSessionId": "550e8400-e29b-41d4-a716-446655440000",
  "productId": "prod-123",
  "colorId": "color-red",
  "storageOptionId": "storage-256gb",
  "ramOptionId": "ram-12gb",
  "quantity": 1
}
```

**Backend Processing:**
1. Validates `guestSessionId` is present
2. Finds or creates `Cart` with `sessionId = guestSessionId` (userId = null)
3. Validates product exists and is ACTIVE
4. Checks stock availability
5. If same product + color + storage + RAM already in cart → increases quantity
6. Otherwise → creates new CartItem
7. Returns formatted cart item

**Response:**
```json
{
  "success": true,
  "message": "Item added to cart",
  "data": {
    "id": "item-456",
    "productId": "prod-123",
    "title": "iPhone 14 Pro",
    "quantity": 1,
    "price": 999.99,
    "total": 999.99,
    "selectedOptions": {
      "color": "Red",
      "storage": "256GB",
      "ram": "12GB"
    }
  }
}
```

**Database Changes:**
- `Cart` created with `sessionId` (userId = null)
- `CartItem` created linking to this cart

---

### Step 3 — View Cart

**API:** `GET /api/cart?guestSessionId=<uuid>`

**Frontend Code:**
```javascript
async function getGuestCart() {
  const guestSessionId = getOrCreateGuestSessionId();
  const res = await fetch(`/api/cart?guestSessionId=${guestSessionId}`);
  return res.json();
}
```

**Backend Processing:**
1. Finds `Cart` by `sessionId = guestSessionId`
2. Fetches all active CartItems with product details
3. Calculates `subtotal` and `totalItems`

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "item-456",
        "productId": "prod-123",
        "title": "iPhone 14 Pro",
        "quantity": 1,
        "price": 999.99,
        "total": 999.99,
        "selectedOptions": { "color": "Red", "storage": "256GB", "ram": "12GB" }
      },
      {
        "id": "item-789",
        "productId": "prod-456",
        "title": "Samsung S26 Ultra",
        "quantity": 2,
        "price": 1199.99,
        "total": 2399.98,
        "selectedOptions": { "color": "Blue", "storage": "512GB", "ram": "16GB" }
      }
    ],
    "subtotal": 3399.97,
    "totalItems": 2
  }
}
```

---

### Step 4 — Update Cart Item Quantity

**API:** `PATCH /api/cart/:cartItemId`

**Frontend Code:**
```javascript
async function updateGuestCartItem(cartItemId, quantity) {
  const guestSessionId = getOrCreateGuestSessionId();

  const res = await fetch(`/api/cart/${cartItemId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guestSessionId, quantity }),
  });

  return res.json();
}
```

**Request Body:**
```json
{
  "guestSessionId": "550e8400-e29b-41d4-a716-446655440000",
  "quantity": 3
}
```

**Backend Processing:**
1. Finds CartItem by ID
2. Verifies `cart.sessionId === guestSessionId` (ownership check)
3. Checks new quantity against available stock
4. Updates quantity
5. Returns updated item

**Response:**
```json
{
  "success": true,
  "message": "Cart item updated",
  "data": {
    "id": "item-456",
    "title": "iPhone 14 Pro",
    "quantity": 3,
    "price": 999.99,
    "total": 2999.97
  }
}
```

---

### Step 5 — Remove Item from Cart

**API:** `DELETE /api/cart/:cartItemId`

**Frontend Code:**
```javascript
async function removeGuestCartItem(cartItemId) {
  const guestSessionId = getOrCreateGuestSessionId();

  const res = await fetch(`/api/cart/${cartItemId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guestSessionId }),
  });

  return res.json();
}
```

**Request Body:**
```json
{
  "guestSessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Backend Processing:**
1. Finds CartItem by ID
2. Verifies `cart.sessionId === guestSessionId`
3. Deletes CartItem

**Response:**
```json
{ "success": true, "message": "Item removed from cart" }
```

---

### Step 6 — Clear Entire Cart

**API:** `DELETE /api/cart`

**Frontend Code:**
```javascript
async function clearGuestCart() {
  const guestSessionId = getOrCreateGuestSessionId();

  const res = await fetch('/api/cart', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guestSessionId }),
  });

  return res.json();
}
```

**Request Body:**
```json
{
  "guestSessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Backend Processing:**
1. Finds Cart by `sessionId = guestSessionId`
2. Deletes all CartItems in that cart

**Response:**
```json
{ "success": true, "message": "Cart cleared" }
```

---

### Step 7 — Checkout (Create Order + Stripe Session) ⭐

**API:** `POST /api/public/product/checkout`

**Frontend Code:**
```javascript
async function guestCheckout({ guestEmail, shippingAddress, shippingMethod, shippingCost, promoCode, cartItemIds }) {
  const guestSessionId = getOrCreateGuestSessionId();

  const res = await fetch('/api/public/product/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      guestSessionId,
      guestEmail,
      cartItemIds: cartItemIds || [],
      shippingAddress,
      shippingMethod: shippingMethod || 'Standard Delivery',
      shippingCost: shippingCost || 0,
      promoCode: promoCode || null,
    }),
  });

  const data = await res.json();

  if (data.success) {
    // Save sessionId — needed to confirm payment after Stripe redirects back
    sessionStorage.setItem('stripeSessionId', data.data.sessionId);
    sessionStorage.setItem('pendingOrderId', data.data.orderId);

    // Redirect user to Stripe payment page
    window.location.href = data.data.checkoutUrl;
  }

  return data;
}
```

**Request Body:**
```json
{
  "guestSessionId": "550e8400-e29b-41d4-a716-446655440000",
  "guestEmail": "guest@example.com",
  "cartItemIds": [],
  "shippingAddress": {
    "fullName": "John Doe",
    "phone": "+1-202-555-0118",
    "street": "123 Main St",
    "city": "San Francisco",
    "state": "CA",
    "zipCode": "94103",
    "country": "US"
  },
  "shippingMethod": "Standard Delivery",
  "shippingCost": 0,
  "promoCode": "SUMMER25"
}
```

**Required Fields:** `guestSessionId`, `guestEmail`, `shippingAddress`
**Optional Fields:** `cartItemIds` (empty array = all items), `shippingMethod`, `shippingCost`, `promoCode`

**Backend Processing (inside a DB transaction):**
1. Validate: `guestSessionId`, `guestEmail`, `shippingAddress` must all be present
2. Find `Cart` where `sessionId = guestSessionId` → error if not found ("Cart is empty")
3. Fetch CartItems (all, or specific `cartItemIds`) → error if empty ("No items to checkout")
4. Validate each product: must be ACTIVE with sufficient `stockQuantity`
5. Create `UserAddress` with `userId = null` (guest address)
6. Create `Order`:
   - `userId = null`
   - `guestEmail = provided email`
   - `addressId = new address id`
   - `totalPrice = calculated total`
   - `orderStatus = PENDING`
   - `paymentStatus = PENDING`
   - Generate unique `stringId` (e.g. `ORD-ABC123`)
7. Create `OrderItem` for each CartItem
8. Decrement `stockQuantity` for each product
9. Validate + apply `promoCode` if provided (increment usage count)
10. Delete all CartItems from this cart (cart cleared)
11. Create Stripe Checkout Session with line items + `metadata: { orderId }`
12. Return `checkoutUrl` and `sessionId`

**Response:**
```json
{
  "success": true,
  "data": {
    "orderId": "order-789",
    "orderNumber": "ORD-ABC123",
    "totalPrice": 3399.97,
    "shippingCost": 0,
    "discountTotal": 99.99,
    "guestEmail": "guest@example.com",
    "checkoutUrl": "https://checkout.stripe.com/pay/cs_test_...",
    "sessionId": "cs_test_123456"
  }
}
```

> **At this point:** The order exists in DB with `PENDING` status. Cart is cleared. Frontend redirects user to Stripe.

---

### Step 8 — Stripe Redirect & User Pays

This step happens **entirely on Stripe's hosted page**. No backend API call from your server.

1. User arrives at `checkoutUrl` (Stripe Checkout page)
2. User enters card details and submits payment
3. On **success** → Stripe redirects to your `STRIPE_SUCCESS_URL`  
   e.g. `https://yoursite.com/checkout/success?orderId=order-789`
4. On **cancel** → Stripe redirects to `STRIPE_CANCEL_URL`

> The `stripeSessionId` saved to `sessionStorage` in Step 7 will be read on the success page to confirm the payment.

---

### Step 9 — Confirm Payment After Stripe Success

**API:** `POST /api/public/product/checkout/confirm`

This is called automatically on your `/checkout/success` page after Stripe redirects back.

**Frontend Code:**
```javascript
// On the /checkout/success page — call this on page load:
async function confirmGuestPayment() {
  const sessionId = sessionStorage.getItem('stripeSessionId');

  if (!sessionId) {
    console.error('No Stripe session found');
    return;
  }

  const res = await fetch('/api/public/product/checkout/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });

  const data = await res.json();

  if (data.success) {
    // Clean up stored session data
    sessionStorage.removeItem('stripeSessionId');
    sessionStorage.removeItem('pendingOrderId');
    clearGuestSessionId(); // guest session is done after payment

    // Display order confirmation
    displayOrderConfirmation(data.data);
  }

  return data;
}
```

**Request Body:**
```json
{
  "sessionId": "cs_test_123456"
}
```

**Backend Processing:**
1. Retrieve Stripe session by `sessionId`
2. Verify `session.payment_status === 'paid'` → throw error if not paid
3. Extract `orderId` from `session.metadata`
4. Update Order:
   - `orderStatus = PROCESSING`
   - `paymentStatus = PAID`
5. Return updated order details

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "order-789",
    "orderId": "ORD-ABC123",
    "orderStatus": "PROCESSING",
    "paymentStatus": "PAID",
    "totalPrice": 3399.97,
    "shippingMethod": "Standard Delivery",
    "guestEmail": "guest@example.com",
    "orderItems": [
      {
        "productId": "prod-123",
        "title": "iPhone 14 Pro",
        "quantity": 1,
        "priceAtPurchase": 999.99
      }
    ],
    "shippingAddress": {
      "fullName": "John Doe",
      "street": "123 Main St",
      "city": "San Francisco",
      "state": "CA",
      "zipCode": "94103",
      "country": "US"
    },
    "createdAt": "2026-05-21T10:30:00Z"
  }
}
```

> **Guest checkout is complete.** The guest can track their order using `guestEmail` + `orderId`.

---
---

## Authenticated User Flow

### Overview
A logged-in user is identified by a **JWT token** stored in the frontend. The `userId` is extracted from the token on every request — no `guestSessionId` needed anywhere.

---

### Step 1 — Register / Login (Get JWT Token)

#### Register

**API:** `POST /api/auth/register`

**Frontend Code:**
```javascript
async function register({ firstName, lastName, email, password }) {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ firstName, lastName, email, password }),
  });
  return res.json();
}
```

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "user@example.com",
  "password": "Password123!"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Registration successful. Please verify your email."
}
```

---

#### Login

**API:** `POST /api/auth/login`

> **Important:** If the user was shopping as a guest before deciding to log in, send their `guestSessionId` here to trigger automatic cart migration. See [Cart Migration](#cart-migration-guest--login) for full details.

**Frontend Code:**
```javascript
async function loginUser({ email, password }) {
  // Check if user had a guest session before logging in
  const guestSessionId = localStorage.getItem('guestSessionId');

  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      guestSessionId: guestSessionId || undefined, // only send if exists
    }),
  });

  const data = await res.json();

  if (data.success) {
    // Save JWT token for future requests
    localStorage.setItem('accessToken', data.accessToken);

    // Clear guest session — cart has been migrated to this account
    if (guestSessionId) {
      localStorage.removeItem('guestSessionId');
    }
  }

  return data;
}
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "Password123!",
  "guestSessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

> `guestSessionId` is **optional**. Only include it when the user had guest cart items.

**Backend Processing:**
1. Validate email and password (bcrypt compare)
2. Check email is verified and account is ACTIVE
3. Generate JWT token containing `userId`
4. **Cart Migration (if `guestSessionId` provided):**
   - Find guest cart by `sessionId = guestSessionId`
   - Find or create authenticated user's cart by `userId`
   - Merge guest items into user's cart (see migration logic)
   - Delete the guest cart
5. Return JWT token + user info

**Response:**
```json
{
  "success": true,
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "user-123",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "CUSTOMER"
  }
}
```

**Frontend:** Store `accessToken` in `localStorage`. Use it in the `Authorization` header for all subsequent requests.

---

### Step 2 — Add Product to Cart

**API:** `POST /api/cart`

**Frontend Code:**
```javascript
function getAuthHeaders() {
  const token = localStorage.getItem('accessToken');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

async function addToCartAuth({ productId, colorId, storageOptionId, ramOptionId, quantity }) {
  const res = await fetch('/api/cart', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ productId, colorId, storageOptionId, ramOptionId, quantity }),
  });
  return res.json();
}
```

**Request Header:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json
```

**Request Body:**
```json
{
  "productId": "prod-123",
  "colorId": "color-red",
  "storageOptionId": "storage-256gb",
  "ramOptionId": "ram-12gb",
  "quantity": 1
}
```

> No `guestSessionId` — the JWT token provides identity. Backend extracts `userId` from token.

**Backend Processing:**
1. Extract `userId` from JWT token
2. Find or create `Cart` with `userId` (sessionId = null)
3. Validate product is ACTIVE and has sufficient stock
4. Create or update CartItem (same combo → increase quantity)
5. Return cart item

**Response:** *(same structure as guest)*

---

### Step 3 — View Cart

**API:** `GET /api/cart`

**Frontend Code:**
```javascript
async function getAuthCart() {
  const res = await fetch('/api/cart', {
    headers: getAuthHeaders(),
  });
  return res.json();
}
```

**Request Header:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

> No query parameter needed — `userId` comes from the token.

**Backend Processing:**
1. Extract `userId` from token
2. Find `Cart` by `userId`
3. Return CartItems with product details

**Response:** *(same structure as guest)*

---

### Step 4 — Update Cart Item Quantity

**API:** `PATCH /api/cart/:cartItemId`

**Frontend Code:**
```javascript
async function updateAuthCartItem(cartItemId, quantity) {
  const res = await fetch(`/api/cart/${cartItemId}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify({ quantity }),
  });
  return res.json();
}
```

**Request Body:**
```json
{ "quantity": 3 }
```

**Backend Processing:**
1. Extract `userId` from token
2. Verify CartItem belongs to this user's cart (ownership check)
3. Check new quantity against available stock
4. Update and return updated item

---

### Step 5 — Remove Item from Cart

**API:** `DELETE /api/cart/:cartItemId`

**Frontend Code:**
```javascript
async function removeAuthCartItem(cartItemId) {
  const res = await fetch(`/api/cart/${cartItemId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return res.json();
}
```

> No body needed — identity comes from the token.

---

### Step 6 — Clear Entire Cart

**API:** `DELETE /api/cart`

**Frontend Code:**
```javascript
async function clearAuthCart() {
  const res = await fetch('/api/cart', {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return res.json();
}
```

---

### Step 7 — Checkout (Create Order + Stripe Session) ⭐

**API:** `POST /api/public/product/checkout`

**Frontend Code:**
```javascript
async function authCheckout({ shippingAddress, shippingMethod, shippingCost, promoCode, cartItemIds }) {
  const res = await fetch('/api/public/product/checkout', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      cartItemIds: cartItemIds || [],
      shippingAddress,
      shippingMethod: shippingMethod || 'Standard Delivery',
      shippingCost: shippingCost || 0,
      promoCode: promoCode || null,
    }),
  });

  const data = await res.json();

  if (data.success) {
    // Save Stripe session ID — needed to confirm payment after redirect
    sessionStorage.setItem('stripeSessionId', data.data.sessionId);
    sessionStorage.setItem('pendingOrderId', data.data.orderId);

    // Redirect to Stripe
    window.location.href = data.data.checkoutUrl;
  }

  return data;
}
```

**Request Header:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json
```

**Request Body:**
```json
{
  "cartItemIds": [],
  "shippingAddress": {
    "fullName": "John Doe",
    "phone": "+1-202-555-0118",
    "street": "123 Main St",
    "city": "San Francisco",
    "state": "CA",
    "zipCode": "94103",
    "country": "US"
  },
  "shippingMethod": "Standard Delivery",
  "shippingCost": 0,
  "promoCode": "SUMMER25"
}
```

> Key differences from guest: no `guestSessionId`, no `guestEmail`. Cart is looked up by `userId` (from token). Email comes from user's account automatically.

**Backend Processing (inside a DB transaction):**
1. Extract `userId` from JWT token
2. Find `Cart` where `userId = userId` → error if not found
3. Fetch CartItems (all, or specific `cartItemIds`) → error if empty
4. Validate stock for all items
5. Create `UserAddress` with `userId` (not null)
6. Create `Order`:
   - `userId = userId`
   - `guestEmail = null`
   - `orderStatus = PENDING`
   - `paymentStatus = PENDING`
   - Generate unique `stringId` (e.g. `ORD-XYZ789`)
7. Create `OrderItem` for each CartItem
8. Decrement `stockQuantity` for each product
9. Validate + apply `promoCode` if provided
10. Delete all CartItems from this cart
11. Create Stripe Checkout Session → return `checkoutUrl` + `sessionId`

**Response:**
```json
{
  "success": true,
  "data": {
    "orderId": "order-789",
    "orderNumber": "ORD-XYZ789",
    "totalPrice": 3399.97,
    "shippingCost": 0,
    "discountTotal": 99.99,
    "checkoutUrl": "https://checkout.stripe.com/pay/cs_test_...",
    "sessionId": "cs_test_123456"
  }
}
```

> **At this point:** Order exists with `PENDING` status. Cart is cleared. Frontend redirects user to Stripe.

---

### Step 8 — Stripe Redirect & User Pays

Same as guest flow — user is redirected to Stripe's hosted checkout page, pays, then Stripe redirects back to `STRIPE_SUCCESS_URL`.

---

### Step 9 — Confirm Payment After Stripe Success

**API:** `POST /api/public/product/checkout/confirm`

**Frontend Code:**
```javascript
// On the /checkout/success page — call this on page load:
async function confirmAuthPayment() {
  const sessionId = sessionStorage.getItem('stripeSessionId');

  if (!sessionId) {
    console.error('No Stripe session found');
    return;
  }

  const res = await fetch('/api/public/product/checkout/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });

  const data = await res.json();

  if (data.success) {
    sessionStorage.removeItem('stripeSessionId');
    sessionStorage.removeItem('pendingOrderId');
    displayOrderConfirmation(data.data);
  }

  return data;
}
```

**Request Body:**
```json
{ "sessionId": "cs_test_123456" }
```

**Backend Processing:** *(identical for both guest and authenticated)*
1. Retrieve Stripe session by `sessionId`
2. Verify `session.payment_status === 'paid'` → throw error if not
3. Extract `orderId` from `session.metadata`
4. Update Order: `orderStatus = PROCESSING`, `paymentStatus = PAID`
5. Return updated order

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "order-789",
    "orderId": "ORD-XYZ789",
    "orderStatus": "PROCESSING",
    "paymentStatus": "PAID",
    "totalPrice": 3399.97,
    "shippingMethod": "Standard Delivery",
    "orderItems": [
      { "productId": "prod-123", "title": "iPhone 14 Pro", "quantity": 1, "priceAtPurchase": 999.99 }
    ],
    "shippingAddress": {
      "fullName": "John Doe",
      "street": "123 Main St",
      "city": "San Francisco",
      "state": "CA",
      "zipCode": "94103",
      "country": "US"
    },
    "createdAt": "2026-05-21T10:30:00Z"
  }
}
```

---

### Step 10 — View Order History (Authenticated Only)

**API:** `GET /api/orders`

**Frontend Code:**
```javascript
async function getOrderHistory({ page = 1, limit = 20, status } = {}) {
  const params = new URLSearchParams({ page, limit });
  if (status) params.append('status', status);

  const res = await fetch(`/api/orders?${params}`, {
    headers: getAuthHeaders(),
  });
  return res.json();
}
```

**Query Parameters:**
| Param | Default | Description |
|-------|---------|-------------|
| `page` | 1 | Page number |
| `limit` | 50 (max 100) | Items per page |
| `status` | *(all)* | `PENDING`, `PROCESSING`, `SHIPPED`, `DELIVERED`, `CANCELLED` |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "order-789",
      "orderId": "ORD-XYZ789",
      "orderStatus": "PROCESSING",
      "paymentStatus": "PAID",
      "totalPrice": 3399.97,
      "createdAt": "2026-05-21T10:30:00Z",
      "orderItems": [...]
    }
  ],
  "meta": {
    "total": 5,
    "page": 1,
    "limit": 20,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false
  }
}
```

---

### Step 11 — Cancel Order (Authenticated Only)

**API:** `POST /api/orders/:id/cancel`

**Frontend Code:**
```javascript
async function cancelOrder(orderId, reason) {
  const res = await fetch(`/api/orders/${orderId}/cancel`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ reason }),
  });
  return res.json();
}
```

**Request Body:**
```json
{ "reason": "Changed my mind" }
```

**Response:**
```json
{
  "success": true,
  "message": "Order cancelled successfully",
  "data": { "orderStatus": "CANCELLED", "cancelledAt": "2026-05-21T12:00:00Z" }
}
```

---
---

## Cart Migration: Guest → Login

### Overview

When a user was shopping as a **guest** (with a `guestSessionId`) and then decides to **log in**, their guest cart items are automatically merged into their account's cart during the login API call.

**No extra API call needed from the frontend** — just send `guestSessionId` with the login request.

---

### The Complete Migration Flow

```
[Frontend]
  1. User browsed and added items as guest (guestSessionId in localStorage)
  2. User clicks "Login"
  3. Frontend reads guestSessionId from localStorage
  4. Frontend sends { email, password, guestSessionId } to POST /api/auth/login
  5. Backend authenticates + merges carts (one atomic operation)
  6. Backend returns accessToken
  7. Frontend saves accessToken to localStorage
  8. Frontend removes guestSessionId from localStorage
  9. All future cart calls use Authorization: Bearer <token>
```

---

### Frontend Implementation

```javascript
// Complete login with automatic cart migration
async function loginWithCartMigration({ email, password }) {
  // Step 1: Check if user has a guest session
  const guestSessionId = localStorage.getItem('guestSessionId');

  // Step 2: Send login request (with guestSessionId if it exists)
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      // Spread guestSessionId only if it exists — backend handles migration automatically
      ...(guestSessionId && { guestSessionId }),
    }),
  });

  const data = await res.json();

  if (data.success) {
    // Step 3: Save the JWT token
    localStorage.setItem('accessToken', data.accessToken);

    // Step 4: Remove guest session ID (cart has been merged into user account)
    localStorage.removeItem('guestSessionId');

    // Step 5: From this point, use Authorization: Bearer <token> for all cart calls
    // The user's cart now contains their old items + the migrated guest items
  }

  return data;
}
```

> **After login:** The `guestSessionId` is gone. All cart operations now use `Authorization: Bearer <token>`. The merged cart is automatically loaded on `GET /api/cart`.

---

### Backend Migration Logic

When the login endpoint receives a `guestSessionId`, it runs this logic after authentication:

```
BACKEND (inside login service):

1. Authenticate user → success
2. Find guest cart:
     SELECT * FROM Cart WHERE sessionId = guestSessionId
   → If NOT found: skip migration (guest had no cart), return login response

3. Find or create user's cart:
     SELECT * FROM Cart WHERE userId = userId
     (or create if doesn't exist)

4. For each item in guest cart:

   a. Check if same product config exists in user cart:
      (same productId + colorId + storageOptionId + ramOptionId)

   b. IF DUPLICATE found:
      - combinedQty = userItem.quantity + guestItem.quantity
      - IF combinedQty <= product.stockQuantity:
          UPDATE userItem SET quantity = combinedQty   ✅ merged
      - ELSE:
          skip this guest item (stock conflict)          ⚠️ skipped

   c. IF NEW (not in user cart):
      - INSERT new CartItem with guestItem data into user cart  ✅ added

5. DELETE guest cart (cascades → removes all guest cart items)
6. Return login response (migration is transparent to frontend)
```

---

### Migration Scenarios

#### Scenario 1: Guest cart moves into empty user cart

```
Guest Cart:
  - iPhone 14 Pro (Red, 256GB, 12GB RAM)  × 2

User Cart: (empty)

────────────────────────── After Login ──────────────────────────

User Cart:
  - iPhone 14 Pro (Red, 256GB, 12GB RAM)  × 2   ✅ migrated
```

---

#### Scenario 2: Guest cart merges with existing user cart (no duplicate products)

```
Guest Cart:
  - iPhone 14 Pro (Red, 256GB)  × 2
  - Samsung S25 (Blue, 512GB)   × 1

User Cart (before login):
  - MacBook Air (Silver, 256GB) × 1

────────────────────────── After Login ──────────────────────────

User Cart:
  - iPhone 14 Pro (Red, 256GB)  × 2   ✅ migrated from guest
  - Samsung S25 (Blue, 512GB)   × 1   ✅ migrated from guest
  - MacBook Air (Silver, 256GB) × 1   ✅ unchanged
```

---

#### Scenario 3: Same product in both carts — quantities combined

```
Guest Cart:
  - iPhone 14 Pro (Red, 256GB, 12GB RAM) × 2

User Cart:
  - iPhone 14 Pro (Red, 256GB, 12GB RAM) × 3

Stock Available: 10

────────────────────────── After Login ──────────────────────────

User Cart:
  - iPhone 14 Pro (Red, 256GB, 12GB RAM) × 5   ✅ (3 + 2, within stock)
```

---

#### Scenario 4: Same product — stock conflict, guest quantity skipped

```
Guest Cart:
  - iPhone 14 Pro (Red, 256GB, 12GB RAM) × 5

User Cart:
  - iPhone 14 Pro (Red, 256GB, 12GB RAM) × 6

Stock Available: 9

────────────────────────── After Login ──────────────────────────

User Cart:
  - iPhone 14 Pro (Red, 256GB, 12GB RAM) × 6   ⚠️ guest qty skipped
                                                   (5 + 6 = 11 > 9 stock)
```

> Stock conflict means guest items are **silently skipped** to prevent overselling. Login still succeeds — only that item is not merged.

---

#### Scenario 5: User logs in without any prior guest session

```
No guestSessionId in localStorage (or not sent to backend)

────────────────────────── After Login ──────────────────────────

User Cart: unchanged (no migration runs)
```

---

### Important Notes

| Point | Detail |
|-------|--------|
| **Automatic** | Migration runs inside the login API — frontend just sends `guestSessionId` |
| **Non-blocking** | If migration fails internally, login still succeeds |
| **Stock-safe** | Merged quantities are validated against stock before updating |
| **Transparent** | Frontend receives no special "migration result" — just the normal login response |
| **One-time** | Guest cart is permanently deleted from DB after migration |
| **Same session** | User can browse as guest → add items → log in → proceed to checkout all in one session |

---
---

## Frontend Utility Code

A reusable module that automatically selects the correct request format based on whether the user is logged in or not. Use this in your frontend so you never have to manually check auth state before every cart call.

```javascript
// utils/cartApi.js

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getOrCreateGuestSessionId() {
  let id = localStorage.getItem('guestSessionId');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('guestSessionId', id);
  }
  return id;
}

function getAccessToken() {
  return localStorage.getItem('accessToken');
}

function isLoggedIn() {
  return !!getAccessToken();
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getAccessToken()}`,
  };
}

function guestHeaders() {
  return { 'Content-Type': 'application/json' };
}

// ─── Cart Operations ──────────────────────────────────────────────────────────

export async function addToCart({ productId, colorId, storageOptionId, ramOptionId, quantity }) {
  if (isLoggedIn()) {
    return fetch('/api/cart', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ productId, colorId, storageOptionId, ramOptionId, quantity }),
    }).then(r => r.json());
  }

  const guestSessionId = getOrCreateGuestSessionId();
  return fetch('/api/cart', {
    method: 'POST',
    headers: guestHeaders(),
    body: JSON.stringify({ guestSessionId, productId, colorId, storageOptionId, ramOptionId, quantity }),
  }).then(r => r.json());
}

export async function getCart() {
  if (isLoggedIn()) {
    return fetch('/api/cart', { headers: authHeaders() }).then(r => r.json());
  }
  const guestSessionId = getOrCreateGuestSessionId();
  return fetch(`/api/cart?guestSessionId=${guestSessionId}`).then(r => r.json());
}

export async function updateCartItem(cartItemId, quantity) {
  if (isLoggedIn()) {
    return fetch(`/api/cart/${cartItemId}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ quantity }),
    }).then(r => r.json());
  }
  const guestSessionId = getOrCreateGuestSessionId();
  return fetch(`/api/cart/${cartItemId}`, {
    method: 'PATCH',
    headers: guestHeaders(),
    body: JSON.stringify({ guestSessionId, quantity }),
  }).then(r => r.json());
}

export async function removeCartItem(cartItemId) {
  if (isLoggedIn()) {
    return fetch(`/api/cart/${cartItemId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    }).then(r => r.json());
  }
  const guestSessionId = getOrCreateGuestSessionId();
  return fetch(`/api/cart/${cartItemId}`, {
    method: 'DELETE',
    headers: guestHeaders(),
    body: JSON.stringify({ guestSessionId }),
  }).then(r => r.json());
}

export async function clearCart() {
  if (isLoggedIn()) {
    return fetch('/api/cart', { method: 'DELETE', headers: authHeaders() }).then(r => r.json());
  }
  const guestSessionId = getOrCreateGuestSessionId();
  return fetch('/api/cart', {
    method: 'DELETE',
    headers: guestHeaders(),
    body: JSON.stringify({ guestSessionId }),
  }).then(r => r.json());
}

// ─── Checkout ─────────────────────────────────────────────────────────────────

export async function checkout({ guestEmail, shippingAddress, shippingMethod, shippingCost, promoCode, cartItemIds }) {
  let body;
  let headers;

  if (isLoggedIn()) {
    headers = authHeaders();
    body = {
      cartItemIds: cartItemIds || [],
      shippingAddress,
      shippingMethod: shippingMethod || 'Standard Delivery',
      shippingCost: shippingCost || 0,
      promoCode: promoCode || null,
    };
  } else {
    headers = guestHeaders();
    const guestSessionId = getOrCreateGuestSessionId();
    body = {
      guestSessionId,
      guestEmail,  // required for guest checkout
      cartItemIds: cartItemIds || [],
      shippingAddress,
      shippingMethod: shippingMethod || 'Standard Delivery',
      shippingCost: shippingCost || 0,
      promoCode: promoCode || null,
    };
  }

  const res = await fetch('/api/public/product/checkout', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (data.success) {
    // Store session data before redirecting to Stripe
    sessionStorage.setItem('stripeSessionId', data.data.sessionId);
    sessionStorage.setItem('pendingOrderId', data.data.orderId);
    window.location.href = data.data.checkoutUrl; // redirect to Stripe
  }

  return data;
}

// ─── Payment Confirmation (call on /checkout/success page) ───────────────────

export async function confirmPayment() {
  const sessionId = sessionStorage.getItem('stripeSessionId');
  if (!sessionId) throw new Error('No pending Stripe session found');

  const res = await fetch('/api/public/product/checkout/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });

  const data = await res.json();

  if (data.success) {
    sessionStorage.removeItem('stripeSessionId');
    sessionStorage.removeItem('pendingOrderId');

    // If guest, clean up session after successful payment
    if (!isLoggedIn()) {
      localStorage.removeItem('guestSessionId');
    }
  }

  return data;
}

// ─── Login with Automatic Cart Migration ──────────────────────────────────────

export async function login({ email, password }) {
  const guestSessionId = localStorage.getItem('guestSessionId');

  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      ...(guestSessionId && { guestSessionId }), // triggers backend migration
    }),
  });

  const data = await res.json();

  if (data.success) {
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.removeItem('guestSessionId'); // clear after migration
  }

  return data;
}

// ─── Logout ───────────────────────────────────────────────────────────────────

export function logout() {
  localStorage.removeItem('accessToken');
  // Note: do NOT remove guestSessionId here — user may start a new guest session
}
```

---

## API Endpoints Reference

### Guest Endpoints (No Auth Header Required)

| Method | Endpoint | Identity Field |
|--------|----------|---------------|
| `POST` | `/api/cart` | `guestSessionId` in body |
| `GET` | `/api/cart?guestSessionId=<uuid>` | `guestSessionId` in query param |
| `PATCH` | `/api/cart/:id` | `guestSessionId` in body |
| `DELETE` | `/api/cart/:id` | `guestSessionId` in body |
| `DELETE` | `/api/cart` | `guestSessionId` in body |
| `POST` | `/api/public/product/checkout` | `guestSessionId` + `guestEmail` in body |
| `POST` | `/api/public/product/checkout/confirm` | `sessionId` (Stripe) in body |

### Authenticated Endpoints (Requires `Authorization: Bearer <token>`)

| Method | Endpoint | Identity Field |
|--------|----------|---------------|
| `POST` | `/api/cart` | JWT token → `userId` |
| `GET` | `/api/cart` | JWT token → `userId` |
| `PATCH` | `/api/cart/:id` | JWT token → `userId` |
| `DELETE` | `/api/cart/:id` | JWT token → `userId` |
| `DELETE` | `/api/cart` | JWT token → `userId` |
| `POST` | `/api/public/product/checkout` | JWT token → `userId` |
| `POST` | `/api/public/product/checkout/confirm` | `sessionId` (Stripe) in body |
| `GET` | `/api/orders` | JWT token → `userId` |
| `POST` | `/api/orders/:id/cancel` | JWT token → `userId` |

---

## Key Differences

| Feature | Guest User | Authenticated User |
|---------|-----------|-------------------|
| **Identity** | `guestSessionId` (UUID in localStorage) | JWT token (in localStorage) |
| **Auth Header** | Not needed | `Authorization: Bearer <token>` |
| **Cart Lookup** | `Cart.sessionId` | `Cart.userId` |
| **Email at Checkout** | Must provide `guestEmail` in body | Comes from user account automatically |
| **Shipping Address** | `UserAddress.userId = null` | `UserAddress.userId = user's id` |
| **Order Tracking** | Via `guestEmail` + `orderId` | Via `userId` (GET /api/orders) |
| **Order History** | Not available | Available (`GET /api/orders`) |
| **Cancel Order** | Not available | Available (`POST /api/orders/:id/cancel`) |
| **Cart Persistence** | UUID-based (localStorage) | User account (DB) |
| **Session Cleanup** | After payment OR after login | No cleanup needed |

---

## Error Handling

| Scenario | Error Response |
|----------|----------------|
| Missing `guestSessionId` | `"Either login or provide guestSessionId"` |
| Invalid or expired JWT | `"Unauthorized: Invalid token"` |
| Product out of stock | `"Only 5 items in stock"` |
| Cart empty at checkout | `"Cart is empty"` |
| No cart items to checkout | `"No items to checkout"` |
| Invalid promo code | `"Promo code is invalid or expired"` |
| Stripe payment not completed | `"Payment not completed"` |
| Stripe session not found | `"Checkout session not found"` |

**All errors follow this shape:**
```json
{
  "success": false,
  "message": "Descriptive error message"
}
```

---

## Database Relations

### Guest Order
```
Cart (sessionId = UUID, userId = null)
  └─ CartItems → deleted after checkout

Order (userId = null, guestEmail = "guest@example.com")
  ├─ UserAddress (userId = null)
  └─ OrderItems
```

### Authenticated User Order
```
Cart (userId = "user-123", sessionId = null)
  └─ CartItems → deleted after checkout

Order (userId = "user-123", guestEmail = null)
  ├─ UserAddress (userId = "user-123")
  └─ OrderItems
```

### After Cart Migration (Guest → Login)
```
Before login:
  GuestCart (sessionId = UUID)      UserCart (userId = "user-123")
    ├─ guestItem1                     ├─ userItem1
    └─ guestItem2                     └─ userItem2

After login:
  GuestCart → DELETED
  UserCart (userId = "user-123")
    ├─ userItem1  (unchanged)
    ├─ userItem2  (unchanged)
    ├─ guestItem1 (migrated)
    └─ guestItem2 (migrated / qty merged if duplicate)
```

---

## Security Considerations

1. **Guest session brute-force:** `guestSessionId` is a random UUID — add rate limiting on cart endpoints to prevent enumeration attacks
2. **Cart ownership:** Backend always verifies `cart.sessionId === guestSessionId` before any mutation on guest carts
3. **JWT validation:** All authenticated endpoints verify token signature and expiry before trusting `userId`
4. **Stock race conditions:** Stock deduction in checkout is wrapped in a DB transaction to prevent overselling under concurrent requests
5. **Payment verification:** Always verify `session.payment_status === 'paid'` directly from Stripe — never trust client-provided payment claims
6. **Promo code atomicity:** Promo usage count is incremented inside the same transaction as order creation to prevent double-use on retries

---

## Summary

```
GUEST FLOW (9 steps):
  [1] Generate UUID (localStorage)
  [2] Add to Cart          → POST /api/cart  { guestSessionId, productId, ... }
  [3] View Cart            → GET  /api/cart?guestSessionId=...
  [4] Update Item          → PATCH /api/cart/:id  { guestSessionId, quantity }
  [5] Remove Item          → DELETE /api/cart/:id  { guestSessionId }
  [6] Clear Cart           → DELETE /api/cart  { guestSessionId }
  [7] Checkout ⭐          → POST /api/public/product/checkout  { guestSessionId, guestEmail, shippingAddress }
  [8] Pay on Stripe        → window.location = checkoutUrl  (Stripe hosted page)
  [9] Confirm Payment      → POST /api/public/product/checkout/confirm  { sessionId }
      → orderStatus: PROCESSING, paymentStatus: PAID  ✅

AUTH FLOW (11 steps):
  [1] Login                → POST /api/auth/login  { email, password }  → save accessToken
  [2] Add to Cart          → POST /api/cart  (Authorization header)
  [3] View Cart            → GET  /api/cart  (Authorization header)
  [4] Update Item          → PATCH /api/cart/:id  (Authorization + quantity)
  [5] Remove Item          → DELETE /api/cart/:id  (Authorization)
  [6] Clear Cart           → DELETE /api/cart  (Authorization)
  [7] Checkout ⭐          → POST /api/public/product/checkout  (Authorization + shippingAddress)
  [8] Pay on Stripe        → window.location = checkoutUrl
  [9] Confirm Payment      → POST /api/public/product/checkout/confirm  { sessionId }
      → orderStatus: PROCESSING, paymentStatus: PAID  ✅
  [10] Order History       → GET  /api/orders  (Authorization)
  [11] Cancel Order        → POST /api/orders/:id/cancel  (Authorization)

CART MIGRATION (Guest → Login):
  Guest adds items → clicks Login
  → Frontend sends { email, password, guestSessionId } to POST /api/auth/login
  → Backend merges guest cart into user cart (combine qty for duplicates, skip on stock conflict)
  → Backend deletes guest cart
  → Frontend removes guestSessionId, saves accessToken
  → User continues shopping with their authenticated cart  ✅
```
