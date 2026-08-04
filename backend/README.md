# Gahezlak

AI-powered restaurant management platform with smart menu search, ordering, and analytics.

## 🚀 Features

- **AI-Powered Menu Search**: Intelligent search with language detection, plus allergy/dietary filtering driven by per-item enrichment (`POST /ai/menu/enrich-all`) — an item with no stored enrichment is treated as *unsafe*, not safe
- **AI Menu OCR**: Upload photos of a paper menu and extract structured items (`POST /ai/menu/vision-extract`)
- **Smart Menu Management**: Menu items with customization options and multilingual support
- **Order Management**: Complete ordering system with payment integration (Paymob)
- **Authentication & Authorization**: JWT-based auth with role-based access control
- **Subscription Plans**: Tiered subscription system for restaurant owners
- **Analytics & Reporting**: Business analytics and reporting for shop owners
- **Admin Dashboard**: Admin panel for platform management
- **QR Code Integration**: QR code generation for restaurants

## 🏗️ Architecture

- **Framework**: Express.js with TypeScript
- **Database**: MongoDB with Mongoose ODM
- **AI Integration**: Claude (`@anthropic-ai/sdk`) for menu OCR, enrichment, and search — optional, lazily initialised, so the app runs normally without `ANTHROPIC_API_KEY`
- **Authentication**: JWT with bcrypt hashing
- **Payments**: Paymob gateway integration
- **File Upload**: Multer for image handling
- **File Storage**: Imgbb integration for image uploads
- **Logging**: Pino with HTTP logging

## 📁 Project Structure

```
├── server.ts        # Process entrypoint: connects the DB, then listens
├── app.ts           # Builds and exports the Express app (no import-time side effects)
├── controllers/     # Route handlers
├── services/        # Business logic
│   └── ai/         # Claude-backed services (menu-extract, menu-enrich, menu-search)
├── models/         # MongoDB schemas
├── routes/         # API routes
├── middlewares/    # Express middleware
├── enums/          # TypeScript enums
├── errors/         # Custom error classes
├── utils/          # Helper functions
├── validators/     # Input validation
├── tests/          # Vitest + supertest (excluded from the build)
└── config/         # Configuration files
```

`server.ts` and `app.ts` are deliberately separate: importing `app.ts` binds no port and opens no database connection, which is what makes it testable and what stops an unconfigured optional integration from being able to take the whole API down at import time.

## 🛠️ Tech Stack

- **Language**: TypeScript
- **Runtime**: Node.js
- **Framework**: Express.js 5.x
- **Database**: MongoDB 8.x
- **ORM**: Mongoose 8.x
- **AI**: Claude via `@anthropic-ai/sdk` (`AI_MODEL`, default `claude-opus-5`)
- **Authentication**: JWT, bcryptjs
- **Payments**: Paymob
- **Image Processing**: Sharp
- **Logging**: Pino
- **Testing**: Vitest + supertest + `mongodb-memory-server`
- **Build Tool**: TypeScript compiler
- **Development**: tsx for hot reloading

## 🚢 Deployment

Deployed as a Render **web service** (`npm run build` → `tsc`; `npm start` → `node --env-file-if-exists=.env dist/server.js`), health-checked at `GET /health`. The project ran on Vercel as serverless functions until 2026-08-03; see `DECISIONS.md` ADR-013 for why it moved, `DEPLOYMENT.md` for the env-var audit, and `render.yaml` for the blueprint. **Nothing has been deployed to Render yet** — the configuration is unverified against a real environment.

- [Frontend Repository](https://github.com/Mohamed-Hasan-77/Gahezlak) (pre-monorepo; the frontend now lives in `../frontend`)
- Retired demo deployment: `https://gahezlak-v1.vercel.app` — kept here as history only; the project no longer deploys to Vercel.
