import asyncio
import os
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage
import httpx



@dataclass
class EmailSettings:
    app_name: str
    email_from: str
    delivery_mode: str
    resend_api_key: str | None
    resend_api_url: str
    smtp_host: str | None
    smtp_port: int
    smtp_user: str | None
    smtp_password: str | None
    smtp_use_ssl: bool
    smtp_use_starttls: bool


def get_email_settings() -> EmailSettings:
    smtp_user = os.getenv("SMTP_USER")
    return EmailSettings(
        app_name=os.getenv("APP_NAME", "TalkFlow"),
        email_from=os.getenv("EMAIL_FROM") or smtp_user or "no-reply@talkflow.digital",
        delivery_mode=os.getenv("EMAIL_DELIVERY_MODE", "auto").lower(),
        resend_api_key=os.getenv("RESEND_API_KEY"),
        resend_api_url=os.getenv("RESEND_API_URL", "https://api.resend.com/emails"),
        smtp_host=os.getenv("SMTP_HOST"),
        smtp_port=int(os.getenv("SMTP_PORT", "587")),
        smtp_user=smtp_user,
        smtp_password=os.getenv("SMTP_PASSWORD"),
        smtp_use_ssl=os.getenv("SMTP_USE_SSL", "false").lower() == "true",
        smtp_use_starttls=os.getenv("SMTP_USE_STARTTLS", "true").lower() == "true",
    )

def _build_verification_email(
    settings: EmailSettings,
    recipient_email: str,
    recipient_name: str | None,
    verification_url: str,
) -> EmailMessage:
    greeting_name = recipient_name or recipient_email
    message = EmailMessage()
    message["Subject"] = f"Verify your {settings.app_name} account"
    message["From"] = settings.email_from
    message["To"] = recipient_email

    text_body = (
        f"Hi {greeting_name},\n\n"
        f"Thanks for joining {settings.app_name}. Please verify your email address by opening the link below:\n\n"
        f"{verification_url}\n\n"
        "If you did not create this account, you can ignore this email."
    )
    html_body = f"""
    <html>
      <body style="font-family: Arial, sans-serif; background: #071018; color: #d8e4ef; padding: 24px;">
        <div style="max-width: 560px; margin: 0 auto; background: #0d1117; border: 1px solid rgba(72, 96, 117, 0.45); border-radius: 18px; padding: 32px;">
          <p style="margin: 0 0 16px; color: #24d3ff; letter-spacing: 0.22em; font-size: 12px; text-transform: uppercase;">{settings.app_name}</p>
          <h1 style="margin: 0 0 12px; font-size: 28px; color: white;">Verify your email</h1>
          <p style="margin: 0 0 20px; line-height: 1.7; color: #a2bacd;">
            Hi {greeting_name}, thanks for joining {settings.app_name}. Confirm your email address to activate login.
          </p>
          <a href="{verification_url}" style="display: inline-block; padding: 14px 22px; border-radius: 12px; background: #24d3ff; color: #061018; font-weight: 700; text-decoration: none;">
            Verify Email
          </a>
          <p style="margin: 20px 0 0; line-height: 1.7; color: #7f97ab;">
            If the button does not work, copy and paste this link into your browser:
          </p>
          <p style="margin: 8px 0 0; line-height: 1.7; word-break: break-all; color: #24d3ff;">{verification_url}</p>
        </div>
      </body>
    </html>
    """

    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")
    return message

async def _send_message_via_resend(settings: EmailSettings, message: EmailMessage) -> None:
    if not settings.resend_api_key:
        raise ValueError("RESEND_API_KEY is not configured.")

    html_part = message.get_body(preferencelist=("html",))
    text_part = message.get_body(preferencelist=("plain",))
    recipients = [addr.strip() for addr in message["To"].split(",") if addr.strip()]

    payload = {
        "from": settings.email_from,
        "to": recipients,
        "subject": message["Subject"],
    }

    if html_part is not None:
        payload["html"] = html_part.get_content()
    if text_part is not None:
        payload["text"] = text_part.get_content()

    headers = {
        "Authorization": f"Bearer {settings.resend_api_key}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(settings.resend_api_url, headers=headers, json=payload)
        response.raise_for_status()


def _log_local_verification_link(recipient_email: str, verification_url: str, reason: str | None = None) -> None:
    suffix = f" ({reason})" if reason else ""
    print(f"LOCAL EMAIL VERIFICATION FOR {recipient_email}: {verification_url}{suffix}")



def _send_message_sync(settings: EmailSettings, message: EmailMessage) -> None:
    if not settings.smtp_host:
        print("EMAIL VERIFICATION LINK DELIVERY SKIPPED: SMTP_HOST is not configured.")
        return

    if settings.smtp_use_ssl:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, context=context) as smtp:
            if settings.smtp_user and settings.smtp_password:
                smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(message)
        return

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as smtp:
        if settings.smtp_use_starttls:
            smtp.starttls(context=ssl.create_default_context())
        if settings.smtp_user and settings.smtp_password:
            smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(message)


async def send_verification_email(recipient_email: str, recipient_name: str | None, verification_url: str) -> None:
    settings = get_email_settings()
    message = _build_verification_email(settings, recipient_email, recipient_name, verification_url)

    if settings.delivery_mode == "local":
        _log_local_verification_link(recipient_email, verification_url)
        return

    if settings.delivery_mode in {"auto", "resend"} and settings.resend_api_key:
        try:
            await _send_message_via_resend(settings, message)
            return
        except httpx.HTTPStatusError as exc:
            response_body = exc.response.text.strip()
            if settings.delivery_mode == "auto":
                _log_local_verification_link(
                    recipient_email,
                    verification_url,
                    reason=f"Resend rejected the message ({exc.response.status_code}): {response_body}",
                )
                return
            raise ValueError(
                f"Resend rejected the verification email with status {exc.response.status_code}: {response_body}"
            ) from exc
        except httpx.HTTPError as exc:
            if settings.delivery_mode == "auto":
                _log_local_verification_link(
                    recipient_email,
                    verification_url,
                    reason=f"Resend request failed: {exc}",
                )
                return
            raise ValueError(f"Resend request failed: {exc}") from exc

    if settings.delivery_mode == "resend":
        raise ValueError("EMAIL_DELIVERY_MODE is 'resend' but RESEND_API_KEY is not configured.")

    if settings.delivery_mode not in {"auto", "smtp"}:
        raise ValueError("EMAIL_DELIVERY_MODE must be one of: auto, resend, smtp, local")

    if not settings.smtp_host:
        _log_local_verification_link(recipient_email, verification_url, reason="SMTP is not configured")
        return

    await asyncio.to_thread(_send_message_sync, settings, message)
