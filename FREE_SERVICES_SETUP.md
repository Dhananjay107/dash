# Free Services Setup Guide

This document explains how to set up FREE services for the Hospital-Pharmacy Ecosystem.

## 📧 Email Notifications (FREE)

### Option 1: Gmail SMTP (100% FREE)
1. Enable 2-Step Verification on your Gmail account
2. Generate an App Password:
   - Go to Google Account → Security → 2-Step Verification → App passwords
   - Create app password for "Mail"
3. Add to `.env`:
```env
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=your-app-password
```

### Option 2: SendGrid (FREE tier: 100 emails/day)
1. Sign up at https://sendgrid.com (FREE)
2. Get API key from dashboard
3. Add to `.env`:
```env
SENDGRID_API_KEY=your-api-key
```

## 📱 SMS Notifications (FREE)

### Option 1: TextLocal (FREE tier: 100 SMS/day)
1. Sign up at https://www.textlocal.in (FREE)
2. Get API key from dashboard
3. Add to `.env`:
```env
TEXT_LOCAL_API_KEY=your-api-key
TEXT_LOCAL_SENDER=TXTLCL
```

### Option 2: Fast2SMS (FREE tier: 10 SMS/day)
1. Sign up at https://www.fast2sms.com (FREE)
2. Get API key
3. Add to `.env`:
```env
FAST2SMS_API_KEY=your-api-key
```

### Option 3: Twilio (FREE trial: $15 credit)
1. Sign up at https://www.twilio.com (FREE trial)
2. Get Account SID and Auth Token
3. Add to `.env`:
```env
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_PHONE_NUMBER=+1234567890
```

## 💬 WhatsApp Notifications (FREE)

### Option 1: Twilio WhatsApp (FREE trial: $15 credit)
1. Use Twilio account from SMS setup
2. Enable WhatsApp Sandbox (FREE for testing)
3. Add to `.env`:
```env
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```

### Option 2: WhatsApp Business API (FREE for small businesses)
- Requires business verification
- Free for limited messages

## 🔔 Push Notifications (100% FREE)

### Expo Push Notifications (FREE - Unlimited)
1. Already integrated in mobile app
2. No setup required - works out of the box
3. Socket.IO fallback also FREE

## 🎤 Voice Recognition (100% FREE)

### Web Speech API (FREE)
- Already implemented in mobile app
- Works in web browsers (Chrome, Edge)
- No API keys needed

### For Native Apps: Expo Speech (FREE)
- Already in package.json
- No setup required

## 📊 Database (FREE)

### MongoDB Atlas (FREE tier: 512MB)
1. Sign up at https://www.mongodb.com/cloud/atlas (FREE)
2. Create free cluster
3. Get connection string
4. Add to `.env`:
```env
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/dbname
```

## 🚀 Hosting (FREE)

### Backend:
- **Railway**: Free tier available
- **Render**: Free tier available
- **Heroku**: Free tier (limited)
- **Vercel**: Free for serverless

### Frontend (Admin Portal):
- **Vercel**: FREE (recommended for Next.js)
- **Netlify**: FREE
- **GitHub Pages**: FREE

### Mobile App:
- **Expo**: FREE hosting and updates
- **Google Play**: One-time $25 fee
- **Apple App Store**: $99/year

## 🔐 Authentication (100% FREE)

- JWT tokens (no external service needed)
- Already implemented

## 📡 Real-time Communication (100% FREE)

- Socket.IO (no external service needed)
- Already implemented

## 💰 Cost Summary

**Total Monthly Cost: $0 (FREE)**

All services can run on free tiers:
- Email: Gmail SMTP (FREE)
- SMS: TextLocal free tier (100/day) or Twilio trial
- WhatsApp: Twilio trial or Socket.IO fallback
- Push: Expo (FREE unlimited)
- Voice: Web Speech API (FREE)
- Database: MongoDB Atlas (FREE 512MB)
- Hosting: Vercel/Railway free tiers
- Real-time: Socket.IO (FREE)

## 🎯 Recommended Setup (100% FREE)

1. **Email**: Gmail SMTP
2. **SMS**: TextLocal (100/day) or Twilio trial
3. **WhatsApp**: Twilio trial or Socket.IO fallback
4. **Push**: Expo (already integrated)
5. **Database**: MongoDB Atlas free tier
6. **Hosting**: Vercel (admin) + Railway (backend)

## 📝 Environment Variables Template

Create `.env` file in `backend/`:

```env
# Database (FREE)
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/dbname

# Email (FREE - Gmail)
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=your-app-password

# SMS (FREE - TextLocal)
TEXT_LOCAL_API_KEY=your-textlocal-key
TEXT_LOCAL_SENDER=TXTLCL

# WhatsApp (FREE - Twilio Trial)
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-token
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886

# Push (FREE - Expo)
EXPO_PUSH_TOKEN=optional-expo-token

# Server
PORT=4000
JWT_SECRET=your-secret-key
NODE_ENV=development
```

## ✅ No Credit Card Required

All services listed above offer free tiers without requiring credit card information.

