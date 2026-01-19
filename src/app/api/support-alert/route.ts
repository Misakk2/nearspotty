import { NextResponse } from "next/server";

// Support alert endpoint for critical failures
// In production, this would send emails via SendGrid/Resend/etc.
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { type, userId, userEmail, plan } = body;

        // Log the alert for now (in production, send email)
        console.error("🚨 SUPPORT ALERT:", {
            type,
            userId,
            userEmail,
            plan,
            timestamp: new Date().toISOString(),
        });

        // TODO: Integrate with email service
        // Example with Resend:
        // await resend.emails.send({
        //     from: 'alerts@nearspotty.online',
        //     to: 'support@nearspotty.online',
        //     subject: `Alert: ${type} for user ${userEmail}`,
        //     html: `<p>User ${userEmail} (${userId}) experienced a ${type} error while trying to subscribe to ${plan} plan.</p>`
        // });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Support alert error:", error);
        return NextResponse.json({ error: "Failed to send alert" }, { status: 500 });
    }
}
