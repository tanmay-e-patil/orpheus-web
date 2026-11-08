import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import NativeAuth from '../src/pages/NativeAuth.svelte';
import { route } from '../src/lib/navigation.svelte';
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  details: vi.fn(),
  authorize: vi.fn(),
  registerBegin: vi.fn(),
  registerFinish: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  assign: vi.fn(),
}));
vi.mock('$lib/api', () => ({
  api: {
    session: mocks.session,
    nativeAuthDetails: mocks.details,
    nativeAuthAuthorize: mocks.authorize,
    passkeyRegisterBegin: mocks.registerBegin,
    passkeyRegisterFinish: mocks.registerFinish,
    logout: mocks.logout,
  },
}));
vi.mock('$lib/core/passkey', () => ({
  Passkey: { isSupported: () => true, register: mocks.register },
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('location', {
    search: '?request=signed-request',
    assign: mocks.assign,
  });
  route.search = location.search;
  mocks.details.mockResolvedValue({ action: 'login' });
  mocks.session.mockResolvedValue({
    authenticated: true,
    user: { id: 'alice', username: 'Alice' },
  });
  mocks.authorize.mockResolvedValue({
    callbackURL: 'orpheus://auth/callback?code=code&state=state',
  });
});
afterEach(() => vi.unstubAllGlobals());
describe('native passkey browser bridge', () => {
  it('requires explicit confirmation before handing an existing browser session to the app', async () => {
    render(NativeAuth);
    const button = await screen.findByRole('button', {
      name: /Continue to Orpheus/,
    });
    expect(mocks.authorize).not.toHaveBeenCalled();
    await fireEvent.click(button);
    await waitFor(() =>
      expect(mocks.assign).toHaveBeenCalledWith(
        'orpheus://auth/callback?code=code&state=state',
      ),
    );
    expect(mocks.authorize).toHaveBeenCalledWith('signed-request');
  });
  it('uses the existing WebAuthn registration contract before returning to the app', async () => {
    mocks.details.mockResolvedValue({
      action: 'register',
      userId: 'alice',
      name: 'My iPhone',
    });
    const options = { publicKey: { challenge: 'challenge' } },
      credential = { id: 'credential', type: 'public-key' };
    mocks.registerBegin.mockResolvedValue(options);
    mocks.register.mockResolvedValue(credential);
    mocks.registerFinish.mockResolvedValue({ ok: true });
    render(NativeAuth);
    await fireEvent.click(
      await screen.findByRole('button', { name: 'Add passkey' }),
    );
    await waitFor(() => expect(mocks.assign).toHaveBeenCalled());
    expect(mocks.register).toHaveBeenCalledWith(options);
    expect(mocks.registerFinish).toHaveBeenCalledWith(credential, 'My iPhone');
    expect(mocks.registerFinish.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.authorize.mock.invocationCallOrder[0],
    );
  });
  it('prevents registration for a different browser account', async () => {
    mocks.details.mockResolvedValue({ action: 'register', userId: 'bob' });
    render(NativeAuth);
    expect(
      await screen.findByText(/same account as the iOS app/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add passkey' }),
    ).not.toBeInTheDocument();
    expect(mocks.authorize).not.toHaveBeenCalled();
  });
  it('rejects a callback to a foreign destination', async () => {
    mocks.authorize.mockResolvedValue({
      callbackURL: 'https://evil.example/steal',
    });
    render(NativeAuth);
    await fireEvent.click(
      await screen.findByRole('button', { name: /Continue to Orpheus/ }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'invalid app callback',
    );
    expect(mocks.assign).not.toHaveBeenCalled();
  });
  it('shows an expired request without offering an account handoff', async () => {
    mocks.details.mockRejectedValue(new Error('This request has expired.'));
    render(NativeAuth);
    expect(await screen.findByRole('alert')).toHaveTextContent('expired');
    expect(mocks.authorize).not.toHaveBeenCalled();
  });
});
