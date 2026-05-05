# Complete Setup Guide

This guide will walk you through setting up the entire Screen Time Management System.

## Prerequisites

- Node.js 18+ installed on your computer
- MongoDB Atlas account (free tier works fine)
- Raspberry Pi with Raspbian/Raspberry Pi OS
- Smartphone or tablet for the mobile app
- Cloud server (Oracle Cloud, AWS, DigitalOcean, etc.) OR local server

## Part 1: MongoDB Atlas Setup

1. Go to https://www.mongodb.com/cloud/atlas and create a free account
2. Create a new cluster (free tier M0 is sufficient)
3. Click "Connect" on your cluster
4. Add your IP address to the whitelist (or use 0.0.0.0/0 for allow all)
5. Create a database user with a password
6. Click "Connect your application" and copy the connection string
7. Your connection string looks like:
   ```
   mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/screentime?retryWrites=true&w=majority
   ```

## Part 2: Backend Setup

### Option A: Cloud Server (Recommended for Production)

1. Get a cloud server (Oracle Cloud Free Tier, AWS EC2, DigitalOcean, etc.)
2. SSH into your server
3. Install Node.js 18+:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```
4. Clone/upload your project to the server
5. Navigate to backend directory:
   ```bash
   cd ScreenTimeApp/backend
   ```
6. Install dependencies:
   ```bash
   npm install
   ```
7. Create `.env` file:
   ```bash
   cp .env.example .env
   nano .env
   ```
8. Fill in your values:
   ```
   MONGODB_URI=your-mongodb-connection-string
   JWT_SECRET=generate-a-random-secret-key
   PI_SERVICE_API_KEY=generate-another-random-key
   PORT=3000
   NODE_ENV=production
   ```

   To generate random keys:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

9. Start the server:
   ```bash
   npm start
   ```

10. For production, use PM2 to keep it running:
    ```bash
    sudo npm install -g pm2
    pm2 start src/server.js --name screentime-backend
    pm2 save
    pm2 startup
    ```

11. Open firewall port 3000:
    ```bash
    sudo ufw allow 3000
    ```

12. Test it works:
    ```bash
    curl http://localhost:3000/health
    ```
    Should return: `{"status":"ok", ...}`

### Option B: Local Development

1. Open terminal in the backend directory
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create `.env` from `.env.example` and fill in values
4. Run:
   ```bash
   npm run dev
   ```

## Part 3: Raspberry Pi Service Setup

### Step 1: Install Pi-hole

On your Raspberry Pi:

```bash
curl -sSL https://install.pi-hole.net | bash
```

Follow the installation wizard:
- Choose your network interface (usually eth0 or wlan0)
- Choose your DNS provider (Google, Cloudflare, etc.)
- Accept the default blocklists
- Install the web admin interface
- Note the admin password shown at the end

After installation:
1. Access Pi-hole admin at `http://pi-hole-ip/admin`
2. Log in with the password
3. Go to Settings > API
4. Show and copy your API token

### Step 2: Configure Router DNS

Your router must point all devices to Pi-hole:

1. Log into your router admin panel (usually 192.168.1.1 or 192.168.0.1)
2. Find DHCP Settings
3. Set Primary DNS Server to your Pi-hole IP (e.g., 192.168.1.2)
4. Save settings
5. Restart router (optional but recommended)

Test: On any device, open a webpage. Ads should be blocked if Pi-hole is working.

### Step 3: Install Pi Service

On the Raspberry Pi:

```bash
cd ~
# If you have git repo
git clone your-repo-url
cd ScreenTimeApp/pi-service

# Or transfer files manually
# scp -r pi-service pi@raspberry-pi-ip:~/screentime-pi-service

npm install
cp .env.example .env
nano .env
```

Fill in `.env`:
```
BACKEND_URL=http://your-cloud-server-ip:3000
PI_SERVICE_API_KEY=same-key-as-backend-env
PIHOLE_URL=http://localhost/admin
PIHOLE_API_TOKEN=your-pihole-api-token
```

Test run:
```bash
npm start
```

You should see:
```
=== Screen Time Pi Service Starting ===
Backend is healthy
Found X device(s)
=== Pi Service Running ===
```

### Step 4: Run as System Service

Create systemd service:

```bash
sudo nano /etc/systemd/system/screentime-pi.service
```

Paste this (adjust paths):
```ini
[Unit]
Description=Screen Time Pi Service
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/ScreenTimeApp/pi-service
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=screentime-pi

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable screentime-pi.service
sudo systemctl start screentime-pi.service
sudo systemctl status screentime-pi.service
```

View logs:
```bash
sudo journalctl -u screentime-pi.service -f
```

## Part 4: Mobile App Setup

### Development Setup

1. Install Expo CLI globally:
   ```bash
   npm install -g expo-cli
   ```

2. Install Expo Go app on your phone:
   - iOS: https://apps.apple.com/app/expo-go/id982107779
   - Android: https://play.google.com/store/apps/details?id=host.exp.exponent

3. Navigate to mobile-app directory:
   ```bash
   cd mobile-app
   npm install
   ```

4. Update API URL in `src/config.js`:
   ```javascript
   export const API_BASE_URL = 'http://your-server-ip:3000/api';
   ```

   For testing:
   - Physical device on same network: `http://192.168.1.x:3000/api` (your computer's IP)
   - iOS Simulator: `http://localhost:3000/api`
   - Android Emulator: `http://10.0.2.2:3000/api`
   - Production: `http://your-cloud-server-ip:3000/api`

5. Start Expo:
   ```bash
   npx expo start
   ```

6. Scan QR code with Expo Go app

### Production Build (Future)

For actual app store deployment:
```bash
# iOS
npx expo build:ios

# Android
npx expo build:android
```

## Part 5: Initial Setup & Testing

### 1. Register First User (Parent)

Open the mobile app:
1. Click "Register"
2. Fill in:
   - Email: your email
   - Password: secure password
   - Name: Your name
   - Family Name: "Smith Family" (or your family name)
   - Role: Parent
3. Click Register

You're now logged in!

### 2. Add Family Members

As a parent:
1. Go to Settings/Family tab
2. Click "Add Family Member"
3. Fill in details for each child
4. Set their allowance rate (default $2/hour)

### 3. Create Chores

1. Go to Chores tab
2. Click "Add Chore"
3. Examples:
   - Name: "Clean your room"
   - Screen Time: 30 minutes
   - Allowance: $1.00

   - Name: "Do dishes"
   - Screen Time: 20 minutes
   - Allowance: $0.50

   - Name: "Homework (1 hour)"
   - Screen Time: 60 minutes
   - Allowance: $2.00

### 4. Register Devices

1. Go to Devices tab
2. Click "Add Device"
3. For each device you want to control:
   - Name: "Johnny's iPad"
   - MAC Address: Find this in device settings or router admin panel
     - iOS: Settings > General > About > Wi-Fi Address
     - Android: Settings > About Phone > Status > Wi-Fi MAC Address
   - Device Type: Tablet/Phone/Computer/Console
   - Assign To: Select which child (or leave as shared)

### 5. Test the Flow

**As a Child:**
1. Log out and log in as a child
2. Go to Chores tab
3. Tap a chore
4. Mark it as complete
5. Add a note (optional)
6. Submit

**As a Parent:**
1. Log out and log in as parent
2. Go to Approvals tab (or see notification)
3. Review the chore completion
4. Approve it

**As a Child Again:**
1. Go to Devices tab
2. See available screen time
3. Select a device
4. Choose duration (up to available time)
5. Click "Enable"
6. Device should now have internet access!

## Troubleshooting

### Backend Issues

**Can't connect to MongoDB:**
- Check connection string in .env
- Verify IP whitelist in MongoDB Atlas
- Test connection: `mongosh "your-connection-string"`

**API not responding:**
- Check server is running: `pm2 status` or `ps aux | grep node`
- Check firewall: `sudo ufw status`
- Check logs: `pm2 logs screentime-backend`

### Pi Service Issues

**Can't connect to backend:**
- Ping backend: `ping your-server-ip`
- Check API key matches
- Check firewall on backend server

**Pi-hole not blocking:**
- Verify devices are using Pi-hole DNS: `nslookup google.com`
- Check Pi-hole is running: `pihole status`
- Check Pi-hole logs in admin interface

**Devices not being controlled:**
- Check MAC addresses are correct
- View Pi service logs: `sudo journalctl -u screentime-pi.service -f`
- Verify Pi-hole API token is correct

### Mobile App Issues

**Can't connect to backend:**
- Check API_BASE_URL in src/config.js
- Ensure phone is on same network (for development)
- Test backend: `curl http://your-server-ip:3000/health`

**App crashes:**
- Clear Expo cache: `npx expo start -c`
- Reinstall dependencies: `rm -rf node_modules && npm install`

## Security Notes

1. Change all default passwords
2. Use strong JWT_SECRET and PI_SERVICE_API_KEY
3. Don't commit .env files to git
4. Use HTTPS in production (set up with nginx + Let's Encrypt)
5. Keep Pi-hole admin interface password protected
6. Consider VPN for accessing backend remotely

## Next Steps

Once everything is working:

1. Customize chore values for your family
2. Adjust allowance rates per child
3. Add all devices you want to control
4. Set up automatic backups for MongoDB
5. Consider adding more features (see ROADMAP.md if you create one)

## Support

For issues or questions:
- Check logs first (backend, Pi service, mobile app)
- Review this guide
- Check GitHub issues if using version control
