// passkey.js — Browser WebAuthn API wrapper
// Handles base64url encoding/decoding for the Go backend (go-webauthn)

export const Passkey = {
  isSupported() {
    return !!window.PublicKeyCredential;
  },

  async register(responseFromServer) {
    // Server returns: { publicKey: { challenge, rp, user, excludeCredentials, ... } }
    const options = responseFromServer.publicKey || responseFromServer;

    const creationOptions = {
      publicKey: {
        ...options,
        challenge: decode(options.challenge),
        user: {
          ...options.user,
          id: decode(options.user.id),
        },
        excludeCredentials: (options.excludeCredentials || []).map((c) => ({
          ...c,
          id: decode(c.id),
        })),
      },
    };
    const credential = await navigator.credentials.create(creationOptions);
    return {
      id: credential.id,
      rawId: encode(credential.rawId),
      response: {
        attestationObject: encode(credential.response.attestationObject),
        clientDataJSON: encode(credential.response.clientDataJSON),
      },
      type: credential.type,
    };
  },

  async authenticate(responseFromServer) {
    // Server returns: { publicKey: { challenge, rpId, allowCredentials, ... } }
    const options = responseFromServer.publicKey || responseFromServer;

    const requestOptions = {
      publicKey: {
        ...options,
        challenge: decode(options.challenge),
        allowCredentials: (options.allowCredentials || []).map((c) => ({
          ...c,
          id: decode(c.id),
        })),
      },
    };
    const credential = await navigator.credentials.get(requestOptions);
    return {
      id: credential.id,
      rawId: encode(credential.rawId),
      response: {
        authenticatorData: encode(credential.response.authenticatorData),
        clientDataJSON: encode(credential.response.clientDataJSON),
        signature: encode(credential.response.signature),
        userHandle: credential.response.userHandle
          ? encode(credential.response.userHandle)
          : null,
      },
      type: credential.type,
    };
  },
};

function encode(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function decode(base64url) {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0)).buffer;
}
