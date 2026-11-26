# WedPlan API

The WedPlan backend: an **Express 5** REST API with **MongoDB/Mongoose**, **Better Auth**
(email/password, Google OAuth, JWT), **Stripe** subscriptions and **ImgBB** uploads.

> Client repository: <https://github.com/mdsafat980-byte/WedPlan-Wedding-Planning-Platform>
> Live client: <https://wed-plan-wedding-planning-platform.vercel.app>
> API service: <https://wedplan-api-ngt2.onrender.com> (health:
> <https://wedplan-api-ngt2.onrender.com/api/health>).
> MongoDB is connected. Stripe Checkout/webhooks, Google sign-in and ImgBB uploads remain
> disabled until their provider credentials are configured.

## Getting started

```bash
npm install
cp .env.example .env
npm run dev
```

The API listens on **http://localhost:5000**. Health check:

```bash
curl http://localhost:5000/api/health
```

### Zero-config development

When `MONGODB_URI` is empty and `NODE_ENV` is not `production`, the server starts an
**in-memory MongoDB** instance (`mongodb-memory-server`). If `AUTO_SEED=true`, it creates demo
vendors, customers, services, bookings and transactions on first boot. All data resets when
the process restarts.

Use a real MongoDB connection string (local MongoDB or Atlas) when you need persistence.

### Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start with `node --watch` |
| `npm start` | Start the server |
| `npm run seed` | Seed demo data if the database is empty |
| `npm run seed:reset` | Drop and reseed all data |

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | No | API port (default `5000`) |
| `NODE_ENV` | No | `development` or `production` |
| `BETTER_AUTH_URL` | Production | Public API origin; JWT issuer/audience and Better Auth base URL |
| `CLIENT_URL` | Production | Allowed client origin for CORS and trusted auth origins |
| `MONGODB_URI` | Production | MongoDB connection string |
| `BETTER_AUTH_SECRET` | Production | 32+ character signing secret |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | No | Enable Google OAuth |
| `STRIPE_SECRET_KEY` | No | Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | No | Stripe webhook signing secret |
| `STRIPE_PREMIUM_PRICE_ID` | No | Recurring Stripe Price ID for Premium |
| `IMGBB_API_KEY` | No | ImgBB uploads; falls back to local disk when empty |
| `PUBLIC_SERVER_URL` | No | Public base URL for local upload links |
| `ADMIN_NAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` | No | Bootstrap admin account |
| `AUTO_SEED` | No | Seed demo data on an empty database |

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Production startup refuses to run without `BETTER_AUTH_SECRET`, `MONGODB_URI`, `CLIENT_URL`
and `BETTER_AUTH_URL`, and requires the secret to be at least 32 characters.

## Authentication

Better Auth is mounted at `/api/auth/*` and owns the `users`, `sessions`, `accounts` and
`verifications` collections.

- Email/password sign-up validates that the password has at least 6 characters, one uppercase
  and one lowercase letter.
- The JWT plugin exposes `GET /api/auth/token` and `GET /api/auth/jwks`.
- Tokens expire after **1 hour**; the issuer and audience are both `BETTER_AUTH_URL`.
- Google can link an existing account only when Google confirms the same email address is
  verified; the local account does not need prior email verification.
- A custom `definePayload` limits claims to `email`, `name` and `role`. The one-time
  `signupRole` field never leaks into a token.
- Registration accepts `signupRole: "customer" | "vendor"`. A database hook maps it to `role`
  and forces `isBlocked: false` and `subscriptionPlan: "free"`. Clients cannot write `role`,
  `isBlocked` or subscription fields directly.
- Session creation is rejected for blocked accounts.

### API authorization

Protected routes require:

```http
Authorization: Bearer <Better Auth JWT>
```

`src/middleware/auth.js` verifies the signature, issuer, audience and expiry with `jose`
against the remote JWKS, then loads the live user from MongoDB. Role guards run after that, so
blocking a user or changing a role takes effect immediately. A customer token on an admin
route returns `403`; an invalid or expired token returns `401`.

## API reference

### Public

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Service and provider configuration status |
| `GET` | `/api/services` | Approved + active services; `search`, `category`, `location`, `sort`, `page`, `limit` |
| `GET` | `/api/services/:id` | Service details plus related services |
| `POST` | `/api/upload` | Multipart `image` upload (ImgBB or local fallback, 5 MB, rate-limited) |

### Profile (any signed-in role)

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/profile` | Current user profile |
| `PATCH` | `/api/profile` | Update `name`, `image`, `businessName`, `phone`, `bio` only |
| `POST` | `/api/profile/become-vendor` | Convert an unused customer account to a vendor |

### Vendor (`role: vendor`)

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/vendor/stats` | Listing, booking and subscription statistics |
| `GET` | `/api/vendor/services` | All of the vendor's services |
| `POST` | `/api/vendor/services` | Create a service (Free limit enforced) |
| `PUT` | `/api/vendor/services/:id` | Update a service and send it back to review |
| `PATCH` | `/api/vendor/services/:id/availability` | Pause or activate a service |
| `DELETE` | `/api/vendor/services/:id` | Delete a service and its bookings |
| `GET` | `/api/vendor/bookings` | Booking requests for the vendor |
| `PATCH` | `/api/vendor/bookings/:id` | Accept or reject a pending request |

### Subscription (`role: vendor`)

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/vendor/subscription` | Plan, usage, price and Stripe readiness |
| `POST` | `/api/vendor/subscription/checkout` | Create a Stripe Checkout session |
| `POST` | `/api/stripe/webhook` | Stripe webhook (raw body + signature verification) |

### Customer (`role: customer`)

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/customer/stats` | Booking counts by status |
| `GET` | `/api/customer/bookings` | All of the customer's bookings |
| `GET` | `/api/customer/bookings/:id` | One booking (ownership enforced) |
| `POST` | `/api/customer/bookings` | Create a request; rejects duplicates with `409` |
| `PATCH` | `/api/customer/bookings/:id/cancel` | Cancel a pending request |

### Admin (`role: admin`)

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/admin/stats` | Users, vendors, customers, services, revenue |
| `GET` | `/api/admin/users` | Search and role filter |
| `GET` | `/api/admin/users/:id` | User details with activity counts |
| `PATCH` | `/api/admin/users/:id/block` | Block or unblock (admins cannot be blocked) |
| `GET` | `/api/admin/services` | Search, status and category filters |
| `PATCH` | `/api/admin/services/:id` | Approve, reject, pause, activate |
| `DELETE` | `/api/admin/services/:id` | Delete a service |
| `GET` | `/api/admin/transactions` | Read-only transaction ledger |

There is deliberately **no admin payment mutation endpoint**.

## Booking rules

- Only approved, active services can be booked.
- The event date must be in the future and the location is required.
- The same service and event date cannot have two `pending` or `accepted` bookings (`409`).
- Vendors cannot book their own services.
- Vendors can only accept/reject requests that belong to them and are still `pending`.
- Customers can only cancel their own `pending` requests.

## Subscription rules

- Free vendors may have at most **3 active approved services**. The limit is checked on
  create, on re-activation and on admin approval.
- Premium removes the limit and adds a premium badge.
- Premium is activated only by verified Stripe webhook events and lasts until the current
  period end.
- `checkout.session.completed`, subscription `created`/`updated`, `deleted` and
  `invoice.payment_failed` are handled. Expired and failed checkouts never grant access.
- If Stripe is not configured, checkout returns `503` with a clear message and the UI disables
  the button.

### Stripe webhook setup

```text
Endpoint: https://<api-host>/api/stripe/webhook
Events:
  checkout.session.completed
  checkout.session.async_payment_succeeded
  checkout.session.expired
  customer.subscription.created
  customer.subscription.updated
  customer.subscription.deleted
  invoice.payment_failed
```

The webhook route is mounted before `express.json()` so the raw body reaches
`stripe.webhooks.constructEvent`.

## Data model

| Model | Key fields |
| --- | --- |
| `User` | Better Auth user mirror + `role`, `isBlocked`, `businessName`, `phone`, `bio`, `subscriptionPlan`, `subscriptionExpiresAt` |
| `Service` | `vendorId`, `serviceName`, `category`, `description`, `price`, `location`, `images[]`, `status`, `isActive`, `rejectionReason` |
| `Booking` | `serviceId`, `vendorId`, `customerId`, `eventDate`, `eventLocation`, `message`, `status` |
| `Transaction` | `vendorId`, `plan`, `amount` (cents), `currency`, `status`, `stripeSessionId`, `stripeSubscriptionId`, `paidAt` |

## Demo seed data

`src/seed.js` creates:

- Admin: `admin@wedplan.com` / `Admin123`
- Premium vendor: `vendor@wedplan.com` / `Vendor123`
- Free vendor: `bloom@wedplan.com` / `Vendor123`
- Customer: `customer@wedplan.com` / `Customer123`
- 11 services across every category (approved, pending and rejected examples)
- Booking requests in multiple states
- Paid and pending subscription transactions

Change `ADMIN_EMAIL` / `ADMIN_PASSWORD` before deploying and never ship the demo accounts to
production.

## Security checklist

- Secrets only from environment variables; `.env` is gitignored.
- JWT signature, issuer, audience and expiry verified on every protected request.
- Live user loaded per request, so blocks and role changes apply immediately.
- Server-side role guards on vendor, customer and admin routers.
- Zod validation on bodies, params and service queries.
- Mongo queries are scoped by the authenticated user's ID.
- Passwords handled entirely by Better Auth.
- Stripe webhook signatures verified; no manual payment mutation.
- Upload MIME/size validation and rate limiting.
- CORS restricted to the configured client origin with credentials enabled.
- Error responses never expose stack traces in production.

## Deployment

This repository includes a Render Blueprint in `render.yaml`.

1. Create a MongoDB Atlas database/user and configure its network access for the API host.
2. In Render, create a Blueprint from this repository and deploy `render.yaml`.
3. Enter the required private environment values when prompted: `MONGODB_URI`,
   `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `BETTER_AUTH_URL`, `PUBLIC_SERVER_URL` and `CLIENT_URL`.
   Set both API URL values to the Render service URL and `CLIENT_URL` to the deployed client
   origin. Render generates `BETTER_AUTH_SECRET`.
4. Configure Stripe test-mode keys, webhook signing secret and Premium recurring Price ID
   before testing checkout. The webhook endpoint is `/api/stripe/webhook`.
5. Optionally add ImgBB and Google OAuth credentials. The Google callback is
   `/api/auth/callback/google`.
6. Verify `/api/health`, then test login, role permissions, booking and Stripe webhook flows.

Never commit production credentials or use the local demo accounts in production.
