# Express + Prisma Backend Server

A Node.js backend server built with Express.js and Prisma ORM, following MVC architecture pattern.

## 📁 Project Structure

```
cbreezy_backend_web_safari/
├── src/
│   ├── routes/           # Route definitions
│   ├── controllers/      # Request handlers
│   ├── services/         # Business logic
│   ├── app.js           # Express app configuration
│   └── server.js        # Server entry point
├── prisma/
│   └── schema.prisma    # Database schema
├── .env                 # Environment variables
├── .env.example         # Example environment variables
└── package.json         # Project dependencies
```

##  Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Database (PostgreSQL, MySQL, or SQLite)

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   Then edit `.env` and set your `DATABASE_URL`

3. **Set up Prisma:**
   ```bash
   # Generate Prisma Client
   npm run prisma:generate

   # Run database migrations
   npm run prisma:migrate
   ```

### Running the Server

**Development mode (with auto-reload):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

The server will start on `http://localhost:3000` (or the port specified in your `.env` file)

##  Available Scripts

- `npm start` - Start the server in production mode
- `npm run dev` - Start the server in development mode with nodemon
- `npm run prisma:generate` - Generate Prisma Client
- `npm run prisma:migrate` - Run database migrations
- `npm run prisma:studio` - Open Prisma Studio (Database GUI)

##  API Endpoints

### Health Check
- `GET /health` - Check server status

### User Routes (Example)
- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get user by ID
- `POST /api/users` - Create new user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

##  Database Setup

1. Update your `DATABASE_URL` in `.env` file
2. Define your models in `prisma/schema.prisma`
3. Run migrations: `npm run prisma:migrate`

### Example Database Model

Add models to `prisma/schema.prisma`:

```prisma
model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

##  Architecture Pattern

This project follows the **MVC (Model-View-Controller)** pattern:

- **Routes** - Define API endpoints and map to controllers
- **Controllers** - Handle HTTP requests/responses
- **Services** - Contain business logic and database operations
- **Prisma** - ORM for database operations (Model layer)

##  Adding New Features

1. **Create a new service** in `src/services/`
2. **Create a new controller** in `src/controllers/`
3. **Create routes** in `src/routes/`
4. **Register routes** in `src/app.js`

##  Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3000 |
| `NODE_ENV` | Environment mode | development |
| `DATABASE_URL` | Database connection string | Required |

##  License

ISC
