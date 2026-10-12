// lib/notifications/email.ts
// Optional email notifications via Resend when a client opens a link (CHUNKS F7+B8)

interface NotifyLinkOpenedParams {
  editorEmail: string;
  clientLabel: string;
  projectTitle: string;
  slug: string;
  viewerIp?: string;
}

export async function sendClientOpenedNotification(params: NotifyLinkOpenedParams): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Resend is optional; skip gracefully if not configured
    return false;
  }

  const { editorEmail, clientLabel, projectTitle, slug } = params;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "ReviewLock <notifications@reviewlock.app>",
        to: [editorEmail],
        subject: `Client Opened: ${clientLabel} viewed "${projectTitle}"`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #ededed; background-color: #0b0c0e; border-radius: 8px;">
            <h2 style="color: #f59e0b; margin-top: 0;">ReviewLock Notification</h2>
            <p style="font-size: 14px; line-height: 1.5; color: #a1a1aa;">
              Your client <strong>${clientLabel}</strong> just opened the preview for <strong>${projectTitle}</strong>.
            </p>
            <div style="margin: 20px 0; padding: 16px; background-color: #16181c; border-radius: 6px; border: 1px solid #27272a;">
              <p style="margin: 4px 0; font-size: 13px;"><strong>Link:</strong> <span style="font-family: monospace; color: #f59e0b;">/v/${slug}</span></p>
              <p style="margin: 4px 0; font-size: 13px;"><strong>Status:</strong> Active preview session claimed</p>
            </div>
            <p style="font-size: 12px; color: #71717a; margin-bottom: 0;">
              This is an automated notification from your ReviewLock instance.
            </p>
          </div>
        `,
      }),
    });

    return res.ok;
  } catch (err) {
    console.warn("[Notifications] Failed to send email via Resend:", err);
    return false;
  }
}
