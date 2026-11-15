// Browser WebAuthn wrapper. Handles base64url encoding for the Go backend
// (go-webauthn), which sends binary fields as base64url strings.

type Base64URL = string;
type ServerCredential = { id: Base64URL; type: PublicKeyCredentialType };

export type PasskeyServerOptions = {
  publicKey: Record<string, unknown>;
};

export type PasskeyCreationResponse = {
  id: string;
  rawId: Base64URL;
  response: { attestationObject: Base64URL; clientDataJSON: Base64URL };
  type: string;
};

export type PasskeyRequestResponse = {
  id: string;
  rawId: Base64URL;
  response: {
    authenticatorData: Base64URL;
    clientDataJSON: Base64URL;
    signature: Base64URL;
    userHandle: Base64URL | null;
  };
  type: string;
};

const decodeCredentials = (credentials: unknown) =>
  ((credentials as ServerCredential[] | undefined) || []).map((c) => ({
    ...c,
    id: decode(c.id),
  }));

export const Passkey = {
  isSupported() {
    return !!window.PublicKeyCredential;
  },

  async register(
    responseFromServer: PasskeyServerOptions,
  ): Promise<PasskeyCreationResponse> {
    const options = responseFromServer.publicKey;
    const user = options.user as { id: Base64URL; [key: string]: unknown };
    const publicKey = {
      ...options,
      challenge: decode(options.challenge as Base64URL),
      user: { ...user, id: decode(user.id) },
      excludeCredentials: decodeCredentials(options.excludeCredentials),
    } as unknown as PublicKeyCredentialCreationOptions;
    const credential = (await navigator.credentials.create({
      publicKey,
    })) as PublicKeyCredential;
    const response = credential.response as AuthenticatorAttestationResponse;
    return {
      id: credential.id,
      rawId: encode(credential.rawId),
      response: {
        attestationObject: encode(response.attestationObject),
        clientDataJSON: encode(response.clientDataJSON),
      },
      type: credential.type,
    };
  },

  async authenticate(
    responseFromServer: PasskeyServerOptions,
  ): Promise<PasskeyRequestResponse> {
    const options = responseFromServer.publicKey;
    const publicKey = {
      ...options,
      challenge: decode(options.challenge as Base64URL),
      allowCredentials: decodeCredentials(options.allowCredentials),
    } as unknown as PublicKeyCredentialRequestOptions;
    const credential = (await navigator.credentials.get({
      publicKey,
    })) as PublicKeyCredential;
    const response = credential.response as AuthenticatorAssertionResponse;
    return {
      id: credential.id,
      rawId: encode(credential.rawId),
      response: {
        authenticatorData: encode(response.authenticatorData),
        clientDataJSON: encode(response.clientDataJSON),
        signature: encode(response.signature),
        userHandle: response.userHandle ? encode(response.userHandle) : null,
      },
      type: credential.type,
    };
  },
};

function encode(buffer: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function decode(base64url: Base64URL) {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0)).buffer;
}
