// Turning a provider profile into an email we are willing to treat as identity.
//
// Both signup and login match an account by EMAIL ALONE — there is no linked
// provider id, no connect-your-account step. So the email a provider hands back
// is not a contact detail here, it is the credential. Anything that reaches
// these functions and comes out the other side can sign in as whoever owns that
// address.
//
// That makes one question load-bearing: did the provider actually VERIFY the
// user controls this address, or is it just a string on their profile?
//
// Google answers it directly with `email_verified`. Microsoft Graph has no such
// field, so the answer has to be inferred from WHICH property the address came
// from — see below.
//
// Callers get either an email or a reason to refuse; there is deliberately no
// "probably fine" path.

export interface OAuthIdentity {
  email: string;
  name: string;
}

/**
 * Flat rather than a discriminated union on purpose: this project compiles with
 * strictNullChecks off, where narrowing on a boolean literal discriminant is
 * unreliable. Exactly one field is ever set.
 */
export interface IdentityResult {
  identity?: OAuthIdentity;
  /** User-facing reason the profile was refused. */
  error?: string;
}

/**
 * Google's `email_verified` is a JSON boolean on the v3 userinfo endpoint, but
 * older endpoints and some proxies stringify it. Accept both rather than
 * silently failing closed on a deployment quirk — and treat everything else,
 * including absent, as unverified.
 */
function isVerifiedFlag(value: unknown): boolean {
  return value === true || value === "true";
}

/**
 * Identity from Google's oauth2/v3/userinfo payload.
 *
 * An unverified Google email means Google never confirmed the person owns that
 * mailbox. Accepting one would let a profile carrying someone else's address
 * sign in as them, because the address is the whole match key.
 */
export function googleIdentity(profile: any): IdentityResult {
  const email = typeof profile?.email === "string" ? profile.email.toLowerCase().trim() : "";

  if (!email) {
    return { error: "Failed to retrieve email from Google" };
  }

  if (!isVerifiedFlag(profile?.email_verified)) {
    return {
      error:
        "Your Google account's email address is not verified. Please verify it with Google and try again.",
    };
  }

  return { identity: { email, name: profile?.name || "Google User" } };
}

/**
 * Identity from Microsoft Graph /me.
 *
 * Graph exposes no verification flag, so the property the address came from is
 * the signal:
 *
 *   `mail` is the directory's mailbox for the account. An administrator or
 *   Microsoft set it; the user cannot type an arbitrary value into it. Trusted.
 *
 *   `userPrincipalName` is a SIGN-IN NAME that merely looks like an email. For
 *   ordinary accounts it usually matches the mailbox, so it stays as a fallback
 *   — but for a B2B guest it is minted as
 *   `someone_theirdomain.com#EXT#@yourtenant.onmicrosoft.com`, which is not an
 *   address anyone can receive mail at. Those are refused outright: the local
 *   part embeds a foreign address, which is exactly the shape that should never
 *   be mistaken for proof of ownership.
 */
export function microsoftIdentity(profile: any): IdentityResult {
  const mail = typeof profile?.mail === "string" ? profile.mail.trim() : "";
  const upn =
    typeof profile?.userPrincipalName === "string" ? profile.userPrincipalName.trim() : "";

  const raw = mail || upn;
  if (!raw) {
    return { error: "Failed to retrieve email from Microsoft" };
  }

  const email = raw.toLowerCase();

  // Guest UPNs are not deliverable addresses and must never stand in for one.
  if (!mail && email.includes("#ext#")) {
    return {
      error:
        "This Microsoft guest account has no mailbox we can verify. Please sign in with an account that has an email address.",
    };
  }

  // A sign-in name is not required to be email-shaped; if it is not, it is not
  // an address and cannot be matched against one.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Failed to retrieve a usable email from Microsoft" };
  }

  return {
    identity: {
      email,
      name: profile?.displayName || profile?.givenName || "Microsoft User",
    },
  };
}
