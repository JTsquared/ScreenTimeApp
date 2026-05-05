# Screen Time & Chore Management App

A family-friendly app that helps children earn screen time and allowance by completing chores.

## Project Structure

- `mobile-app/` - React Native (Expo) mobile application
- `backend/` - Node.js/Express cloud backend with MongoDB
- `pi-service/` - Raspberry Pi service for DNS control via Pi-hole

## Technology Stack

### Mobile App
- React Native with Expo
- React Navigation
- Axios for API calls
- AsyncStorage for local caching

### Backend
- Node.js with Express
- MongoDB Atlas
- JWT authentication
- Bcrypt for password hashing

### Local Service (Raspberry Pi)
- Pi-hole for DNS filtering
- Node.js service for device control
- Polling-based communication with cloud backend

## Features

- **Chore Management**: Create and assign chores with configurable screen time and allowance rewards
- **Approval Workflow**: Parents review and approve completed chores
- **Device Control**: Automatic internet enable/disable for specific devices via DNS control
- **Allowance Tracking**: Track earnings and payouts with configurable rates per child
- **Multi-Device Sync**: Real-time updates across all family devices
- **Parent Dashboard**: Monitor all children's activities and pending approvals
- **Child Dashboard**: View available chores, earned time, and select devices to use

## Setup Instructions

### Prerequisites
- Node.js 18+ installed
- MongoDB Atlas account (free tier works)
- Raspberry Pi with Pi-hole installed
- Expo Go app on mobile devices for development

### Backend Setup
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your MongoDB connection string
npm run dev
```

### Mobile App Setup
```bash
cd mobile-app
npm install
npx expo start
```

### Raspberry Pi Service Setup
```bash
cd pi-service
npm install
cp .env.example .env
# Edit .env with your cloud backend URL and API key
npm start
```

## Environment Variables

See individual `.env.example` files in each directory for required configuration.

## Development

Each component can be developed and tested independently:
- Backend runs on `http://localhost:3000`
- Mobile app runs via Expo
- Pi service runs on Raspberry Pi and polls backend

## License

Private family project
