# Raspberry Pi Service

This service runs on a Raspberry Pi in your home network and communicates with both the cloud backend and your Pi-hole DNS server to control internet access for family devices.

## Prerequisites

- Raspberry Pi (any model with network connectivity)
- Pi-hole installed and configured
- Node.js 18+ installed on the Pi
- Network access to both Pi-hole and cloud backend

## Pi-hole Setup

### Option 1: Install Pi-hole on the Same Raspberry Pi

```bash
curl -sSL https://install.pi-hole.net | bash
```

Follow the installation prompts and note your Pi-hole admin password and API token.

### Option 2: Use Existing Pi-hole

If you already have Pi-hole running elsewhere on your network, you just need the URL and API token.

### Getting Pi-hole API Token

1. Log into Pi-hole admin interface (http://pi.hole/admin or http://your-pi-ip/admin)
2. Go to Settings > API
3. Click "Show API token" and copy it

### Configure Router DNS

For Pi-hole to control devices, all devices must use Pi-hole as their DNS server:

1. Log into your router admin panel
2. Find DHCP settings
3. Set Primary DNS to your Pi-hole IP address (e.g., 192.168.1.2)
4. Save and restart router if needed

Devices will pick up the new DNS settings when they reconnect or renew their DHCP lease.

## Installation

1. Transfer this directory to your Raspberry Pi:
```bash
# On your computer
scp -r pi-service pi@your-pi-ip:~/screentime-pi-service

# Or clone if you've pushed to git
ssh pi@your-pi-ip
git clone your-repo-url
cd screentime-pi-service/pi-service
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment:
```bash
cp .env.example .env
nano .env
```

Edit the `.env` file with your actual values:
- `BACKEND_URL`: Your cloud server URL (e.g., http://your-server-ip:3000)
- `PI_SERVICE_API_KEY`: Match this with backend's .env file
- `PIHOLE_URL`: Your Pi-hole URL (usually http://localhost/admin if on same Pi)
- `PIHOLE_API_TOKEN`: Your Pi-hole API token

## Running the Service

### Manual Start (for testing)
```bash
npm start
```

### Run as System Service (recommended)

Create a systemd service file:

```bash
sudo nano /etc/systemd/system/screentime-pi.service
```

Add the following content (adjust paths as needed):

```ini
[Unit]
Description=Screen Time Pi Service
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/screentime-pi-service
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=screentime-pi

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
sudo systemctl enable screentime-pi.service
sudo systemctl start screentime-pi.service
```

Check status:

```bash
sudo systemctl status screentime-pi.service
```

View logs:

```bash
sudo journalctl -u screentime-pi.service -f
```

## How It Works

1. **Command Polling**: Every 5 seconds, polls the cloud backend for pending device enable/disable commands
2. **Session Monitoring**: Every 60 seconds, checks for expired screen time sessions
3. **Device Control**: Communicates with Pi-hole API to enable/disable internet access per device
4. **Timer Management**: Maintains local timers to automatically disable devices when time expires

## Troubleshooting

### Service won't start
- Check .env file has correct values
- Verify backend is reachable: `curl http://your-backend-url/health`
- Verify Pi-hole is running: `curl http://localhost/admin/api.php`

### Devices not being blocked
- Verify devices are using Pi-hole as DNS (check router DHCP settings)
- Check Pi-hole is working: log into admin interface
- View service logs: `sudo journalctl -u screentime-pi.service -f`

### Backend connection errors
- Ensure firewall allows connection to backend
- Verify API key matches between Pi service and backend
- Check network connectivity: `ping your-backend-ip`

## Notes on DNS-Based Blocking

This service uses DNS-level blocking via Pi-hole. This means:

**Pros:**
- Works for any device on the network
- No apps need to be installed on child devices
- Relatively simple to set up
- Effective for most users

**Cons:**
- Tech-savvy users can bypass by changing DNS settings manually
- Requires all devices to use Pi-hole as DNS server
- May not work if device has hardcoded DNS servers

For younger children, DNS blocking is very effective and simple.

## Security Considerations

- Keep the API key secret
- Pi service only needs to run on local network
- Pi-hole admin interface should be password protected
- Consider running Pi service as non-root user (default: pi)
