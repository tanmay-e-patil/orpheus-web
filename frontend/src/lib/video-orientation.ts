type LandscapeOrientation = {
  lock?: (orientation: 'landscape') => Promise<void>;
  unlock?: () => void;
};

let landscapeOwner: object | undefined;

// Lock only for this playback session, and undo late lock completions after exit.
export function createLandscapeLock(
  report: (stage: string, detail?: string) => void,
) {
  const unlock = (orientation: LandscapeOrientation) => {
    try {
      orientation.unlock?.();
    } catch (error) {
      report('landscape-unlock-failed', String(error));
    }
  };
  let attempted = false;
  let attempt:
    | { orientation: LandscapeOrientation; active: boolean; locked: boolean }
    | undefined;
  return {
    request() {
      if (attempted) return;
      attempted = true;
      const orientation = screen.orientation as
        LandscapeOrientation | undefined;
      if (!orientation?.lock) {
        report('landscape-unsupported');
        return;
      }
      const current = { orientation, active: true, locked: false };
      attempt = current;
      landscapeOwner = current;
      const failed = (error: unknown) => {
        if (current.active) report('landscape-rejected', String(error));
      };
      try {
        void orientation.lock('landscape').then(() => {
          if (!current.active) {
            if (!landscapeOwner) unlock(orientation);
            return;
          }
          if (landscapeOwner !== current) return;
          current.locked = true;
          report('landscape-locked');
        }, failed);
      } catch (error) {
        failed(error);
      }
    },
    release() {
      attempted = false;
      const previous = attempt;
      attempt = undefined;
      if (!previous) return;
      previous.active = false;
      if (landscapeOwner === previous) {
        landscapeOwner = undefined;
        if (previous.locked) unlock(previous.orientation);
      }
    },
  };
}
