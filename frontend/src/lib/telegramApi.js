/**
 * Telegram integration API helpers.
 * All calls go through the GenOS backend (JWT-protected).
 */

const BASE = "/api/v1/telegram";

/**
 * Generate a Telegram deep-link token.
 * Returns { deep_link, token, expires_in }
 */
export async function generateTelegramToken(authToken) {
  const res = await fetch(`${BASE}/generate-token`, {
    method: "POST",
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail || "Failed to generate Telegram token.");
  }
  return res.json();
}

/**
 * Check whether the current user has linked their Telegram account.
 * Returns { linked: boolean, username: string | null }
 */
export async function getTelegramStatus(authToken) {
  const res = await fetch(`${BASE}/status`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail || "Failed to fetch Telegram status.");
  }
  return res.json();
}

/**
 * Unlink Telegram from the current GenOS account.
 * Returns { ok: true }
 */
export async function unlinkTelegram(authToken) {
  const res = await fetch(`${BASE}/unlink`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.detail || "Failed to unlink Telegram.");
  }
  return res.json();
}
