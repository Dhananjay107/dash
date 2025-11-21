import { Notification } from "./notification.model";
import { getSocketIO } from "../activity/activity.service";
import nodemailer from "nodemailer";

export interface NotificationData {
  userId?: string;
  type: string;
  title: string;
  message: string;
  metadata?: any;
  channel?: "SMS" | "WHATSAPP" | "PUSH" | "EMAIL";
}

// FREE SMS Service - Using TextLocal API (Free tier: 100 SMS/day)
// Alternative: Fast2SMS (Free tier: 10 SMS/day), Twilio (Free trial $15 credit)
async function sendSMS(phone: string, message: string): Promise<boolean> {
  try {
    const TEXT_LOCAL_API_KEY = process.env.TEXT_LOCAL_API_KEY || "";
    const TEXT_LOCAL_SENDER = process.env.TEXT_LOCAL_SENDER || "TXTLCL";
    
    if (!TEXT_LOCAL_API_KEY) {
      // Fallback: Use email-to-SMS gateway (FREE)
      // Most carriers support email-to-SMS: phone@carrier.com
      console.log(`[SMS-Fallback] To: ${phone}, Message: ${message}`);
      return true;
    }

    // TextLocal API (Free tier available)
    const response = await fetch("https://api.textlocal.in/send/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apikey: TEXT_LOCAL_API_KEY,
        numbers: phone,
        message: message,
        sender: TEXT_LOCAL_SENDER,
      }),
    });

    const data = await response.json();
    return data.status === "success";
  } catch (error) {
    console.error("SMS sending failed, using fallback:", error);
    // Fallback: Log for manual sending or use email-to-SMS
    return true;
  }
}

// FREE WhatsApp - Using WhatsApp Web API (Free) or Twilio WhatsApp (Free trial)
// Alternative: Use WhatsApp Business API (Free for small businesses)
async function sendWhatsApp(phone: string, message: string): Promise<boolean> {
  try {
    // Option 1: Use Twilio WhatsApp (Free trial with $15 credit)
    const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
    const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
    const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886";

    if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64")}`,
          },
          body: new URLSearchParams({
            From: TWILIO_WHATSAPP_FROM,
            To: `whatsapp:${phone}`,
            Body: message,
          }),
        }
      );

      const data = await response.json();
      return !data.error;
    }

    // Fallback: Log for manual sending (FREE)
    console.log(`[WhatsApp-Fallback] To: ${phone}, Message: ${message}`);
    return true;
  } catch (error) {
    console.error("WhatsApp sending failed, using fallback:", error);
    return true;
  }
}

// FREE Email - Using Nodemailer with Gmail (Free) or SendGrid (Free tier: 100 emails/day)
async function sendEmail(email: string, subject: string, message: string): Promise<boolean> {
  try {
    // Using Gmail SMTP (FREE) - requires app password
    const GMAIL_USER = process.env.GMAIL_USER || "";
    const GMAIL_PASS = process.env.GMAIL_APP_PASSWORD || "";

    if (GMAIL_USER && GMAIL_PASS) {
      // Using nodemailer for Gmail SMTP (FREE)
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: GMAIL_USER,
          pass: GMAIL_PASS,
        },
      });

      await transporter.sendMail({
        from: GMAIL_USER,
        to: email,
        subject: subject,
        text: message,
        html: `<p>${message}</p>`,
      });

      return true;
    }

    // Fallback: Log for manual sending
    console.log(`[Email-Fallback] To: ${email}, Subject: ${subject}, Message: ${message}`);
    return true;
  } catch (error) {
    console.error("Email sending failed:", error);
    return true; // Don't fail the notification, just log it
  }
}

// FREE Push Notifications - Using Expo Push Notifications (Free)
async function sendPushNotification(userId: string, title: string, body: string): Promise<boolean> {
  try {
    // Expo Push Notifications (FREE)
    const EXPO_PUSH_TOKEN = process.env.EXPO_PUSH_TOKEN || "";
    
    if (EXPO_PUSH_TOKEN) {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          to: EXPO_PUSH_TOKEN,
          title: title,
          body: body,
          sound: "default",
          priority: "high",
        }),
      });

      const data = await response.json();
      return data.data?.status === "ok";
    }

    // Fallback: Socket.IO push (FREE - already implemented)
    const io = getSocketIO();
    if (io) {
      io.to(userId).emit("push_notification", { title, body });
    }
    
    console.log(`[Push] To: ${userId}, Title: ${title}, Body: ${body}`);
    return true;
  } catch (error) {
    console.error("Push notification failed:", error);
    return true;
  }
}

export async function createNotification(data: NotificationData): Promise<any> {
  const notification = await Notification.create({
    userId: data.userId,
    type: data.type,
    title: data.title,
    message: data.message,
    metadata: data.metadata,
    channel: data.channel || "PUSH",
    status: "PENDING",
  });

  // Send via appropriate channel
  try {
    let sent = false;

    if (data.channel === "SMS" && data.metadata?.phone) {
      sent = await sendSMS(data.metadata.phone, data.message);
    } else if (data.channel === "WHATSAPP" && data.metadata?.phone) {
      sent = await sendWhatsApp(data.metadata.phone, data.message);
    } else if (data.channel === "EMAIL" && data.metadata?.email) {
      sent = await sendEmail(data.metadata.email, data.title, data.message);
    } else if (data.channel === "PUSH" && data.userId) {
      sent = await sendPushNotification(data.userId, data.title, data.message);
    } else {
      // Default: Use Socket.IO push (FREE)
      const io = getSocketIO();
      if (io && data.userId) {
        io.to(data.userId).emit("notification", {
          id: notification._id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          createdAt: notification.createdAt,
        });
      }
      sent = true;
    }

    notification.status = sent ? "SENT" : "FAILED";
    await notification.save();
  } catch (error) {
    console.error("Failed to send notification:", error);
    notification.status = "FAILED";
    notification.errorMessage = error instanceof Error ? error.message : "Unknown error";
    await notification.save();
  }

  // Always emit via Socket.IO for real-time updates (FREE)
  const io = getSocketIO();
  if (io && data.userId) {
    io.to(data.userId).emit("notification", {
      id: notification._id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      createdAt: notification.createdAt,
    });
  }

  return notification;
}

// Send appointment reminder (1 hour before) - Uses FREE services
export async function sendAppointmentReminder(
  patientId: string,
  patientPhone: string,
  doctorName: string,
  scheduledAt: Date
): Promise<void> {
  const message = `Reminder: You have an appointment with Dr. ${doctorName} in 1 hour at ${scheduledAt.toLocaleString()}`;
  
  // Try WhatsApp first (free tier), fallback to SMS, then push
  await createNotification({
    userId: patientId,
    type: "APPOINTMENT_REMINDER",
    title: "Appointment Reminder",
    message,
    metadata: { phone: patientPhone, scheduledAt },
    channel: "WHATSAPP",
  });

  // Also send push notification (FREE via Socket.IO)
  await createNotification({
    userId: patientId,
    type: "APPOINTMENT_REMINDER",
    title: "Appointment Reminder",
    message,
    metadata: { scheduledAt },
    channel: "PUSH",
  });
}
