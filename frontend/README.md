Gahezlak Platform - Documentation

Retired demo link : https://gahezlak-v1.vercel.app/ (history only — the project moved off Vercel to Render on 2026-08-03; see DECISIONS.md ADR-013 and DEPLOYMENT.md. Nothing has been deployed to Render yet, so there is no current live URL.)

🔄 Overview

Gahezlak is a full-stack, real-time SaaS platform that allows restaurants and cafes to easily digitize their menus, manage orders, and handle customer experiences through QR codes and direct web links.

Designed as a multi-tenant solution, each restaurant has an isolated environment with its own dashboard, analytics, staff, and settings, while the core system offers global administration and control.

📄 Project Summary

Type: Multi-Tenant SaaS

Target: Restaurants & Cafes

Core Features:

Digital Menu Creation via OCR

Real-time Ordering & Status Updates

Role-Based Staff Management

Payment Integration (Cash/Credit via Paymob)

Admin Panel for Platform Control

QR Code & URL for Public Access

AI Enhancements (Allergy & Diet Filtering, Suggestions)

⚖️ Tech Stack

✨ Frontend

React + TypeScript

Tailwind CSS + Shadcn UI

React Hook Form + Zod (validation)

Framer Motion (animations)

Recharts (analytics)

TanStack Query (data fetching, subscriptions)

Context API (auth, tenant context)

i18next (multi-language support)

⚡ Backend

Node.js + Express + TypeScript

MongoDB

Socket.io (for real-time updates)

Paymob SDK (online payments)

Anthropic Claude via @anthropic-ai/sdk (AI filtering, menu enrichment + OCR parsing) — replaced OpenAI on 2026-08-03

Nodemailer (notifications)

Pino (logging)

📚 Core Modules

1. Dashboard (Per Restaurant Owner)

Analytics:

Revenue & Order Tracking

Daily Trends, Order Status, Popular Items

Menu:

CRUD on Categories & Items

OCR-Based Menu Upload & Parsing

Orders:

Live Updates

Status Transitions (e.g., preparing > ready)

Staff Management:

Add/Remove Kitchen Staff

Assign Roles

Reports:

Reviews & Customer Feedback

Settings:

Restaurant Details

Preferences

2. Customer Menu Page

Real-Time Menu via QR or link

Category Filtering

AI-Based Filtering

Allergens

Health-based Suggestions

(Allergen/dietary filtering reads per-item enrichment data. An item that has not been enriched is treated as unsafe rather than safe, so a menu is filtered only after the owner runs enrichment from the dashboard.)

Add to Cart & Checkout

Payment:

Cash or Online via Paymob

Order Tracking:

Track status by order number

3. Admin Panel

Manage Subscribed Restaurants

Monitor Usage & Analytics


Scripts

npm run dev (development — Vite dev server)

npm run build && npm start (production)

Note: since 2026-08-03 the frontend is not a static bundle in production. npm start runs a small Express server (server/index.ts + server/app.ts) that serves dist/, injects per-shop <head> metadata per request, generates /sitemap.xml, and sets the CSP and other security headers in code. VITE_API_URL is required both at build time (Vite bakes it into the bundle) and at runtime (the server derives the CSP's connect-src from it); there is deliberately no hardcoded API host fallback any more.

✨ Future Features

Table Reservation System

Delivery Flow

Coupons / Loyalty System

Admin Analytics Over Multiple Restaurants

🌟 Summary Statement

Gahezlak empowers any restaurant or café to fully digitize its customer experience in minutes. From menu management to real-time order tracking and AI-powered filtering, it's a complete end-to-end SaaS platform for the modern dining experience.
