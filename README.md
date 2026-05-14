# 💊 PharmaDash

PharmaDash is a professional, full-stack pharmacy delivery and management platform. It features real-time rider tracking, AI-powered prescription scanning, and an advanced analytics dashboard for administrators.

---

## 🚀 Key Features

### 👤 For Customers
- **Smart Search:** Find medicines and generics in seconds.
- **AI Prescription Scanner:** Upload a photo of a prescription; our AI extracts the medicines and populates your cart automatically.
- **🚨 SOS Emergency Mode:** Need medicine urgently? Toggle SOS for dedicated, non-batched, high-priority delivery.
- **Live GPS Tracking:** Watch your rider move in real-time on a live map from the pharmacy to your doorstep.

### 🛵 For Riders
- **Order Management:** View available pickups and manage active deliveries.
- **Integrated Mapping:** Built-in maps showing pickup (Pharmacy) and drop-off (Customer) locations.
- **Status Control:** One-tap updates for Pickup, Out for Delivery, and Delivered.

### 📊 For Administrators
- **Intelligence Dashboard:** Monitor total revenue, active orders, and user demographics.
- **Inventory Monitoring:** Real-time stock tracking with automated **Low Stock Alerts**.
- **User Management:** Oversee all customers and riders on the platform.

---

## 🛠 Tech Stack

- **Frontend:** React.js, Vite, Vanilla CSS (Premium Aesthetics), Leaflet.js (Maps), Socket.io-client.
- **Backend:** Node.js, Express, Socket.io (Real-time Telemetry), TypeScript.
- **Database:** PostgreSQL (via Supabase), Prisma ORM.
- **Authentication:** JWT (JSON Web Tokens) with role-based access control.

---

## 📦 Installation & Setup

### 1. Prerequisites
- Node.js (v18+)
- PostgreSQL Database (Supabase recommended)

### 2. Clone the Repository
```bash
git clone https://github.com/devesh3001/PharmaDash.git
cd PharmaDash
```

### 3. Backend Setup
```bash
cd backend
npm install
```
Create a `.env` file in the `backend` folder:
```env
DATABASE_URL="your_postgresql_pooled_url"
DIRECT_URL="your_postgresql_direct_url"
JWT_SECRET="your_secret_key"
```
Run database migrations:
```bash
npx prisma db push
npx prisma generate
```
Start the backend:
```bash
npm run dev
```

### 4. Frontend Setup
```bash
cd ../customer-app
npm install
npm run dev
```

---

## 🗺 Project Structure

```text
PharmaDash/
├── backend/               # Node.js + Express API
│   ├── prisma/            # Database schema & seeds
│   └── src/               # API Source code
└── customer-app/          # React.js Frontend
    ├── public/            # Static assets
    └── src/
        ├── api/           # Backend communication
        ├── components/    # UI Components
        ├── context/       # Auth & State management
        └── pages/         # Application Views
```

---

## 📄 License
This project is for educational/demo purposes.
